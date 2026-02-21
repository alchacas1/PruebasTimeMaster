import { useState, useEffect, useCallback } from 'react';
import type { User, UserPermissions } from '../types/firestore';
import { TokenService } from '../services/tokenService';
import { UsersService } from '../services/users';
import { normalizeUserPermissions } from '../utils/permissions';

interface SessionData {
  id?: string;
  name: string;
  ownercompanie?: string;
  role?: 'admin' | 'user' | 'superadmin';
  permissions?: UserPermissions;
  loginTime: string;
  lastActivity?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  keepActive?: boolean; // Nueva propiedad para sesiones extendidas
  useTokenAuth?: boolean; // Nueva propiedad para indicar si usar autenticación por tokens
}

// Duración de la sesión en horas por tipo de usuario
const SESSION_DURATION_HOURS = {
  superadmin: 4,    // SuperAdmin: 4 horas por seguridad
  // Admins get the same session duration as SuperAdmins
  admin: 4,
  user: 720,        // User: 30 días
  extended: 168     // Sesión extendida: 1 semana (7 días * 24 horas)
};

// Tiempo de inactividad máximo antes de logout automático (en minutos)
const MAX_INACTIVITY_MINUTES = {
  superadmin: 30,   // SuperAdmin: 30 minutos
  // Admins use the same inactivity timeout as SuperAdmins
  admin: 30,
  user: 480         // User: 8 horas
};

// Evita loops de recarga cuando expiró la sesión
const SESSION_EXPIRED_RELOAD_KEY = 'pricemaster_session_expired_reload_at';
const SESSION_EXPIRED_RELOAD_WINDOW_MS = 10_000;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionWarning, setSessionWarning] = useState(false);
  const [useTokenAuth, setUseTokenAuth] = useState(false); // Estado para controlar el tipo de autenticación
  // Función para generar ID de sesión único (short format)
  const generateSessionId = () => {
    // Generate a short session ID: timestamp base36 + random string
    const timestamp = Date.now().toString(36); // Much shorter than decimal
    const random = Math.random().toString(36).substr(2, 6); // 6 chars instead of 9
    return `${timestamp}${random}`;
  };

  // Función para obtener información del navegador
  const getBrowserInfo = () => {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled
    };
  };

  // Función para verificar tiempo de inactividad
  const checkInactivity = useCallback((session: SessionData) => {
    if (!session.lastActivity || !session.role) return false;

    const lastActivity = new Date(session.lastActivity);
    const now = new Date();
    const minutesInactive = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
    const maxInactivity = MAX_INACTIVITY_MINUTES[session.role] || MAX_INACTIVITY_MINUTES.user;

    return minutesInactive > maxInactivity;
  }, []);
  // Función para actualizar actividad del usuario
  const updateActivity = useCallback(() => {
    if (isAuthenticated && user) {
      const sessionData = localStorage.getItem('pricemaster_session');
      if (sessionData) {
        try {
          const session: SessionData = JSON.parse(sessionData);
          session.lastActivity = new Date().toISOString();
          localStorage.setItem('pricemaster_session', JSON.stringify(session));
        } catch (error) {
          console.error('Error updating activity:', error);
        }
      }
    }
  }, [isAuthenticated, user]);

  const logout = useCallback((reason?: string) => {
    // Limpiar datos de sesión según el tipo de autenticación
    if (useTokenAuth) {
      TokenService.revokeToken();
    } else {
      localStorage.removeItem('pricemaster_session');
      localStorage.removeItem('pricemaster_session_id');
    }
    setUser(null);
    setIsAuthenticated(false);
    setSessionWarning(false);
    setUseTokenAuth(false);
    setLoading(false);
  }, [useTokenAuth]);

  const logoutAndReloadOnce = useCallback((reason?: string) => {
    // Limpia estado/almacenamiento primero
    logout(reason);

    // En cliente: recargar solo una vez por ventana de tiempo
    if (typeof window === 'undefined') return;

    try {
      const now = Date.now();
      const last = Number(sessionStorage.getItem(SESSION_EXPIRED_RELOAD_KEY) || '0');

      // Si ya se recargó recientemente, evitar loop
      if (last && now - last < SESSION_EXPIRED_RELOAD_WINDOW_MS) {
        return;
      }

      sessionStorage.setItem(SESSION_EXPIRED_RELOAD_KEY, String(now));
    } catch {
      // Si sessionStorage falla, seguimos igual (preferible a quedar colgado)
    }

    // Dar un tick para que React aplique estado antes de recargar
    setTimeout(() => {
      window.location.reload();
    }, 50);
  }, [logout]);

  const checkExistingSession = useCallback(() => {
    try {
      // Verificar primero si hay una sesión de token
      const tokenInfo = TokenService.getTokenInfo();
      if (tokenInfo.isValid && tokenInfo.user) {
        // Usar autenticación por token
        setUseTokenAuth(true);

        const newUserData = {
          id: tokenInfo.user.id,
          name: tokenInfo.user.name,
          ownercompanie: tokenInfo.user.ownercompanie,
          role: tokenInfo.user.role,
          permissions: normalizeUserPermissions(tokenInfo.user.permissions, tokenInfo.user.role || 'user'),
          // Ensure ownerId and eliminate are available for actor-aware logic
          ownerId: tokenInfo.user.ownerId || '',
          eliminate: tokenInfo.user.eliminate ?? false
        };

        // Check if user data has changed to prevent unnecessary re-renders
        const hasUserChanged = !user ||
          user.id !== newUserData.id ||
          user.name !== newUserData.name ||
          user.ownercompanie !== newUserData.ownercompanie ||
          user.role !== newUserData.role ||
          JSON.stringify(user.permissions) !== JSON.stringify(newUserData.permissions);

        if (hasUserChanged) {
          setUser(newUserData);
        }

        if (!isAuthenticated) {
          setIsAuthenticated(true);
        }

        // Advertencia de token (24 horas antes de expirar)
        const hoursLeft = tokenInfo.timeLeft / (1000 * 60 * 60);
        const shouldShowWarning = hoursLeft <= 24 && hoursLeft > 0;
        if (shouldShowWarning !== sessionWarning) {
          setSessionWarning(shouldShowWarning);
        }

        return;
      }

      // Si no hay token válido, verificar sesión tradicional
      const sessionData = localStorage.getItem('pricemaster_session');
      if (sessionData) {
        setUseTokenAuth(false);
        const session: SessionData = JSON.parse(sessionData);

        // Verificar si la sesión no ha expirado según el rol o configuración extendida
        const loginTime = new Date(session.loginTime);
        const now = new Date();
        const hoursElapsed = (now.getTime() - loginTime.getTime()) / (1000 * 60 * 60);

        // Usar duración extendida solo si la sesión fue creada con token (keepActive no otorgará 1 semana a sesiones tradicionales)
        let maxHours;
        if (session.keepActive && session.useTokenAuth) {
          // Solo sesiones basadas en token pueden obtener la duración extendida
          maxHours = SESSION_DURATION_HOURS.extended; // 1 semana
        } else {
          maxHours = SESSION_DURATION_HOURS[session.role || 'user'] || SESSION_DURATION_HOURS.user;
        }

        // Verificar inactividad
        const isInactive = checkInactivity(session);

        if (hoursElapsed < maxHours && !isInactive) {
          // Only update user if the data has actually changed
          const sessionObj = session as unknown as Record<string, unknown>;
          const newUserData = {
            id: session.id,
            name: session.name,
            ownercompanie: (sessionObj.ownercompanie as string) || session.ownercompanie,
            role: session.role,
            permissions: normalizeUserPermissions(session.permissions, (session.role as any) || 'user'),
            // Restore ownerId and eliminate if present in the stored session
            ownerId: (sessionObj.ownerId as string) || '',
            eliminate: (sessionObj.eliminate as boolean) ?? false
          };

          // Check if user data has changed to prevent unnecessary re-renders
          const hasUserChanged = !user ||
            user.id !== newUserData.id ||
            user.name !== newUserData.name ||
            user.ownercompanie !== newUserData.ownercompanie ||
            user.role !== newUserData.role ||
            JSON.stringify(user.permissions) !== JSON.stringify(newUserData.permissions);

          if (hasUserChanged) {
            setUser(newUserData);
          }

          if (!isAuthenticated) {
            setIsAuthenticated(true);
          }

          // Advertencia de sesión para SuperAdmin (30 minutos antes de expirar)
          if (session.role === 'superadmin') {
            const minutesLeft = (maxHours * 60) - (hoursElapsed * 60);
            const shouldShowWarning = minutesLeft <= 30 && minutesLeft > 0;
            if (shouldShowWarning !== sessionWarning) {
              setSessionWarning(shouldShowWarning);
            }
          }

        } else {
          // Sesión expirada o inactiva
            logoutAndReloadOnce('expired_or_inactive');
        }
      } else {
        // No hay sesión persistida (ni token válido). Asegurar estado consistente.
        if (user || isAuthenticated || useTokenAuth) {
            logoutAndReloadOnce('missing_session');
        }
      }
    } catch (error) {
      console.error('Error checking session:', error);
        logoutAndReloadOnce('check_error');
    } finally {
      setLoading(false);
    }
    }, [checkInactivity, logoutAndReloadOnce, user, isAuthenticated, sessionWarning, useTokenAuth]);
  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null;

    checkExistingSession();

    // Configurar listener en tiempo real para actualizaciones de usuario (permisos, etc.)
    if (isAuthenticated && user?.id) {
      unsubscribeUser = UsersService.subscribeToUser(
        user.id,
        (updatedUserData) => {
          if (updatedUserData) {
            const normalizedPerms = normalizeUserPermissions(updatedUserData.permissions, updatedUserData.role || 'user');
            setUser((prevUser) => {
              if (!prevUser) return prevUser;

              // Actualizar solo si hay cambios relevantes (especialmente permisos)
              const hasPermissionsChanged = JSON.stringify(prevUser.permissions) !== JSON.stringify(normalizedPerms);
              const hasDataChanged = 
                prevUser.name !== updatedUserData.name ||
                prevUser.ownercompanie !== updatedUserData.ownercompanie ||
                prevUser.role !== updatedUserData.role ||
                hasPermissionsChanged;

              if (!hasDataChanged) return prevUser;
              // Actualizar también en localStorage para mantener sincronizado
              if (useTokenAuth) {
                // Actualizar token con nuevos datos
                const tokenData = TokenService.getTokenInfo();
                if (tokenData.isValid) {
                  TokenService.createTokenSession(updatedUserData);
                }
              } else {
                // Actualizar sesión tradicional
                const sessionData = localStorage.getItem('pricemaster_session');
                if (sessionData) {
                  try {
                    const session = JSON.parse(sessionData);
                    session.permissions = normalizedPerms;
                    session.name = updatedUserData.name;
                    session.role = updatedUserData.role;
                    localStorage.setItem('pricemaster_session', JSON.stringify(session));
                  } catch (err) {
                    console.error('Error updating session with new permissions:', err);
                  }
                }
              }

              return {
                ...prevUser,
                ...updatedUserData,
                permissions: normalizedPerms
              };
            });
          }
        },
        (error) => {
          console.error('Error en listener de usuario:', error);
        }
      );
    }

    // Configurar listener para actividad del usuario
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => {
      updateActivity();
    };

    // Agregar listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Verificar sesión cada 5 minutos
    const sessionInterval = setInterval(() => {
      checkExistingSession();
    }, 5 * 60 * 1000);

    // Cleanup
    return () => {
      if (unsubscribeUser) {
        unsubscribeUser();
      }
      activityEvents.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      clearInterval(sessionInterval);
    };
  }, [checkExistingSession, updateActivity, isAuthenticated, user?.id, useTokenAuth]);
  const login = (userData: User, keepActive: boolean = false, useTokens: boolean = false) => {
    const normalizedPerms = normalizeUserPermissions(userData.permissions, userData.role || 'user');
    if (useTokens) {
      // Usar autenticación por tokens (una semana automáticamente)
      TokenService.createTokenSession(userData);
      const userObj = userData as unknown as Record<string, unknown>;
      const enrichedUser = {
        ...userData,
        permissions: normalizedPerms,
        ownerId: (userObj.ownerId as string) || '',
        eliminate: (userObj.eliminate as boolean) ?? false
      };
      setUser(enrichedUser);
      setIsAuthenticated(true);
      setSessionWarning(false);
      setUseTokenAuth(true);
    } else {
      // Usar autenticación tradicional
      const sessionId = generateSessionId();
      const browserInfo = getBrowserInfo();

      // Crear datos de sesión completos
      const sessionDataObj = {
        id: userData.id,
        name: userData.name,
        ownercompanie: (userData as unknown as Record<string, unknown>).ownercompanie as string | undefined,
        role: userData.role,
        permissions: normalizedPerms,
        loginTime: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        sessionId,
        userAgent: browserInfo.userAgent,
        keepActive: keepActive, // Agregar información del toggle
        useTokenAuth: false,
        // Persist ownerId and eliminate so restored session provides full actor info
        ownerId: ((userData as unknown as Record<string, unknown>).ownerId as string) || '',
        eliminate: ((userData as unknown as Record<string, unknown>).eliminate as boolean) ?? false
      };
      const sessionData = sessionDataObj as unknown as SessionData;

      // Guardar sesión
      localStorage.setItem('pricemaster_session', JSON.stringify(sessionData));
      localStorage.setItem('pricemaster_session_id', sessionId);

      const userObj2 = userData as unknown as Record<string, unknown>;
      const enrichedUser = {
        ...userData,
        permissions: normalizedPerms,
        ownerId: (userObj2.ownerId as string) || '',
        eliminate: (userObj2.eliminate as boolean) ?? false
      };
      setUser(enrichedUser);
      setIsAuthenticated(true);
      setSessionWarning(false);
      setUseTokenAuth(false);
    }
  };

  // Función para obtener tiempo restante de sesión
  const getSessionTimeLeft = useCallback(() => {
    if (!user || !isAuthenticated) return 0;

    if (useTokenAuth) {
      // Usar tiempo del token
      return TokenService.getTokenTimeLeft();
    } else {
      // Usar tiempo de sesión tradicional
      const sessionData = localStorage.getItem('pricemaster_session');
      if (!sessionData) return 0;

      try {
        const session: SessionData = JSON.parse(sessionData);
        const loginTime = new Date(session.loginTime);
        const now = new Date();
        const hoursElapsed = (now.getTime() - loginTime.getTime()) / (1000 * 60 * 60);

        // Usar duración extendida solo para sesiones creadas como token (no aplicar keepActive de 1 semana a sesiones tradicionales)
        let maxHours;
        if (session.keepActive && session.useTokenAuth) {
          maxHours = SESSION_DURATION_HOURS.extended; // 1 semana
        } else {
          maxHours = SESSION_DURATION_HOURS[session.role || 'user'] || SESSION_DURATION_HOURS.user;
        }

        return Math.max(0, maxHours - hoursElapsed);
      } catch {
        return 0;
      }
    }
  }, [user, isAuthenticated, useTokenAuth]);

  const isAdmin = useCallback(() => {
    return user?.role === 'admin' || user?.role === 'superadmin';
  }, [user?.role]);

  const isSuperAdmin = useCallback(() => {
    return user?.role === 'superadmin';
  }, [user?.role]);

  const canChangeOwnercompanie = useCallback(() => {
    return user?.role === 'admin' || user?.role === 'superadmin';
  }, [user?.role]);
  // Función para verificar si el usuario necesita autenticación de dos factores
  const requiresTwoFactor = useCallback(() => {
    // Require two-factor for both SuperAdmins and Admins
    return user?.role === 'superadmin' || user?.role === 'admin';
  }, [user?.role]);

  // Función para obtener información del tipo de sesión
  const getSessionType = useCallback(() => {
    return useTokenAuth ? 'token' : 'traditional';
  }, [useTokenAuth]);

  // Función para obtener tiempo formateado
  const getFormattedTimeLeft = useCallback(() => {
    if (useTokenAuth) {
      return TokenService.formatTokenTimeLeft();
    } else {
      const timeLeft = getSessionTimeLeft();
      if (timeLeft <= 0) return 'Sesión expirada';

      const hours = Math.floor(timeLeft);
      const minutes = Math.floor((timeLeft - hours) * 60);

      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else {
        return `${minutes}m`;
      }
    }
  }, [useTokenAuth, getSessionTimeLeft]);

  return {
    user,
    isAuthenticated,
    loading,
    sessionWarning,
    useTokenAuth,
    login,
    logout,
    isAdmin,
    isSuperAdmin,
    canChangeOwnercompanie,
    requiresTwoFactor,
    getSessionTimeLeft,
    updateActivity,
    getSessionType,
    getFormattedTimeLeft
  };
}
