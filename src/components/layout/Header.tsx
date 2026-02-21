"use client";

import Image from "next/image";
import {
  Settings,
  LogOut,
  Menu,
  X,
  Scan,
  Calculator,
  Type,
  FileCode,
  Banknote,
  Smartphone,
  Clock,
  Truck,
  History,
  User,
  ChevronDown,
  Bell,
  UserPlus,
  Users,
  Layers,
  Shield,
  Star,
  RefreshCw,
  Trash2,
  Plus,
} from "lucide-react";
import { CustomIcon } from "@/icons/icons";
import { useState, useEffect, useRef } from "react";
import {
  collection,
  query as fbQuery,
  where as fbWhere,
  orderBy as fbOrderBy,
  limit as fbLimit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/config/firebase";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useAuth } from "../../hooks/useAuth";
import { ThemeToggle } from "./ThemeToggle";
import { getDefaultPermissions } from "../../utils/permissions";
import FloatingSessionTimer from "../session/FloatingSessionTimer";
import EditProfileModal from "../edicionPerfil/EditProfileModal";
import {
  ConfigurationModal,
  CalculatorModal,
  NotificationModal,
} from "../modals";
import type { UserPermissions } from "../../types/firestore";

const getCreatedAtDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") {
    try {
      const asDate = value.toDate();
      if (asDate instanceof Date && !Number.isNaN(asDate.getTime()))
        return asDate;
      const fallback = new Date(asDate);
      if (!Number.isNaN(fallback.getTime())) return fallback;
    } catch {
      // ignore conversion errors
    }
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

type ActiveTab =
  | "scanner"
  | "calculator"
  | "converter"
  | "xml"
  | "cashcounter"
  | "recetas"
  | "agregarproducto"
  | "timingcontrol"
  | "controlhorario"
  | "empleados"
  | "calculohorasprecios"
  | "supplierorders"
  | "histoscans"
  | "scanhistory"
  | "edit"
  | "solicitud"
  | "fondogeneral"
  | "agregarproveedor"
  | "reportes";

interface HeaderProps {
  activeTab?: ActiveTab | null;
  onTabChange?: (tab: ActiveTab | null) => void;
}

export default function Header({ activeTab, onTabChange }: HeaderProps) {
  const { logout, user } = useAuth();
  const pathname = usePathname();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [hasNewSolicitudes, setHasNewSolicitudes] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [showSessionTimer, setShowSessionTimer] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showSupplierWeekInMenu, setShowSupplierWeekInMenu] = useState(false);
  const [enableHomeMenuSortMobile, setEnableHomeMenuSortMobile] = useState(false);
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initializedSolicitudesRef = useRef(false);
  const knownSolicitudesRef = useRef<Set<string>>(new Set());
  const [currentHash, setCurrentHash] = useState("");
  // Ensure component is mounted on client
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    if (!audioRef.current) {
      const audio = new Audio("/arrival-sound.mp3");
      audio.preload = "auto";
      audioRef.current = audio;
    }
  }, [isClient]);

  // Cargar preferencia del FloatingSessionTimer desde localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedPreference = localStorage.getItem("show-session-timer");
      // Por defecto está desactivado (false)
      setShowSessionTimer(savedPreference === "true");
    }
  }, []);

  // Cargar preferencia de la calculadora desde localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedPreference = localStorage.getItem("show-calculator");
      // Por defecto está desactivado (false)
      setShowCalculator(savedPreference === "true");
    }
  }, []);

  // Cargar preferencia de la tarjeta semanal de proveedores (HomeMenu) desde localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedPreference = localStorage.getItem("show-supplier-week-menu");
      // Por defecto está desactivado (false)
      setShowSupplierWeekInMenu(savedPreference === "true");
    }
  }, []);

  // Cargar preferencia para ordenar el HomeMenu en móvil
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedPreference = localStorage.getItem("enable-home-menu-sort-mobile");
      // Por defecto está desactivado (false)
      setEnableHomeMenuSortMobile(savedPreference === "true");
    }
  }, []);

  // Guardar preferencia del FloatingSessionTimer cuando cambie
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("show-session-timer", showSessionTimer.toString());
    }
  }, [showSessionTimer]);

  // Guardar preferencia de la calculadora cuando cambie
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("show-calculator", showCalculator.toString());
    }
  }, [showCalculator]);

  // Guardar preferencia de la tarjeta semanal de proveedores cuando cambie
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "show-supplier-week-menu",
        showSupplierWeekInMenu.toString()
      );

      // Notifica a otros componentes en la misma pestaña
      // (el evento 'storage' no se dispara en el mismo documento).
      window.dispatchEvent(
        new CustomEvent("pricemaster:preference-change", {
          detail: { key: "show-supplier-week-menu" },
        })
      );
    }
  }, [showSupplierWeekInMenu]);

  // Guardar preferencia para ordenar el HomeMenu en móvil cuando cambie
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "enable-home-menu-sort-mobile",
        enableHomeMenuSortMobile.toString()
      );

      window.dispatchEvent(
        new CustomEvent("pricemaster:preference-change", {
          detail: { key: "enable-home-menu-sort-mobile" },
        })
      );
    }
  }, [enableHomeMenuSortMobile]);

  // Keep currentHash in sync in case some code manipulates history.hash
  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateHash = () => setCurrentHash(window.location.hash || "");
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  // Close dropdown on scroll or resize
  useEffect(() => {
    if (!showUserDropdown) return;

    const handleScrollOrResize = () => {
      setShowUserDropdown(false);
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [showUserDropdown]);

  // Close config modal with ESC key
  useEffect(() => {
    // If neither modal is open, nothing to do
    if (!showConfigModal && !showEditProfileModal) return;

    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Close whichever modal(s) are open
        if (showConfigModal) setShowConfigModal(false);
        if (showEditProfileModal) setShowEditProfileModal(false);
      }
    };

    document.addEventListener("keydown", handleEscKey);

    return () => {
      document.removeEventListener("keydown", handleEscKey);
    };
  }, [showConfigModal, showEditProfileModal]);

  // Real-time listener for solicitudes for the user's company (onSnapshot)
  useEffect(() => {
    if (!isClient || !user) return;

    const company =
      (user as any)?.ownercompanie || (user as any)?.ownerCompanie || "";
    if (!company) {
      knownSolicitudesRef.current = new Set();
      initializedSolicitudesRef.current = false;
      setHasNewSolicitudes(false);
      return;
    }

    knownSolicitudesRef.current = new Set();
    initializedSolicitudesRef.current = false;

    try {
      const q = fbQuery(
        collection(db, "solicitudes"),
        fbWhere("empresa", "==", company),
        fbOrderBy("createdAt", "desc"),
        fbLimit(50)
      );

      const handleSolicitudesUpdate = (docs: any[]) => {
        const safeDocs = Array.isArray(docs) ? docs : [];
        const pendingDocs = safeDocs.filter((doc) => !doc?.listo);

        if (initializedSolicitudesRef.current) {
          const previousIds = knownSolicitudesRef.current;
          const hasNewPending = pendingDocs.some((doc) => {
            const id = doc?.id;
            return typeof id === "string" && !previousIds.has(id);
          });

          if (hasNewPending) {
            const player =
              audioRef.current ??
              (typeof Audio !== "undefined"
                ? new Audio("/arrival-sound.mp3")
                : null);
            if (player) {
              audioRef.current = player;
              try {
                player.currentTime = 0;
                const playPromise = player.play();
                if (playPromise && typeof playPromise.catch === "function") {
                  playPromise.catch((err) => {
                    console.warn("Unable to play notification sound:", err);
                  });
                }
              } catch (err) {
                console.warn("Unable to play notification sound:", err);
              }
            }
          }
        }

        knownSolicitudesRef.current = new Set(
          pendingDocs
            .map((doc) => doc?.id)
            .filter((id): id is string => typeof id === "string")
        );
        initializedSolicitudesRef.current = true;

        const candidate = pendingDocs[0] ?? safeDocs[0];
        if (!candidate) {
          setHasNewSolicitudes(false);
          return;
        }

        const createdAt = getCreatedAtDate(candidate?.createdAt);
        const key = `pricemaster_last_seen_solicitudes_${user.id || user.ownercompanie || "anon"
          }`;
        const lastSeenRaw = localStorage.getItem(key);
        const lastSeen = lastSeenRaw ? new Date(lastSeenRaw) : null;

        if (
          !lastSeen ||
          (createdAt && createdAt.getTime() > lastSeen.getTime())
        ) {
          setHasNewSolicitudes(true);
        } else {
          setHasNewSolicitudes(false);
        }
      };

      const unsubscribe = onSnapshot(
        q,
        async (snapshot) => {
          try {
            if (!snapshot || snapshot.empty) {
              handleSolicitudesUpdate([]);
              return;
            }

            const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            handleSolicitudesUpdate(docs);
          } catch (err) {
            console.error("Error in solicitudes onSnapshot handler:", err);
          }
        },
        (err) => {
          console.error("onSnapshot error for solicitudes:", err);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error("Error setting up solicitudes listener:", err);
      return;
    }
  }, [isClient, user]);

  // Navigation tabs with permissions
  const allTabs = [
    {
      id: "scanner" as ActiveTab,
      name: "Escáner",
      icon: Scan,
      description: "Escanear códigos de barras",
      permission: "scanner" as keyof UserPermissions,
    },
    {
      id: "calculator" as ActiveTab,
      name: "Calculadora",
      icon: Calculator,
      description: "Calcular precios con descuentos",
      permission: "calculator" as keyof UserPermissions,
    },
    {
      id: "converter" as ActiveTab,
      name: "Conversor",
      icon: Type,
      description: "Convertir y transformar texto",
      permission: "converter" as keyof UserPermissions,
    },
    {
      id: "xml" as ActiveTab,
      name: "XML",
      icon: FileCode,
      description: "Cargar archivos XML",
      permission: "xml" as keyof UserPermissions,
    },
    {
      id: "cashcounter" as ActiveTab,
      name: "Contador Efectivo",
      icon: Banknote,
      description: "Contar billetes y monedas (CRC/USD)",
      permission: "cashcounter" as keyof UserPermissions,
    },
    {
      id: "timingcontrol" as ActiveTab,
      name: "Control Tiempos",
      icon: Smartphone,
      description: "Registro de venta de tiempos",
      permission: "timingcontrol" as keyof UserPermissions,
    },
    {
      id: "controlhorario" as ActiveTab,
      name: "Control Horario",
      icon: Clock,
      description: "Registro de horarios de trabajo",
      permission: "controlhorario" as keyof UserPermissions,
    },
    {
      id: "empleados" as ActiveTab,
      name: "Empleados",
      icon: Users,
      description: "Información de empleados (próximamente)",
      permission: "empleados" as keyof UserPermissions,
    },
    {
      id: "recetas" as ActiveTab,
      name: "Recetas",
      icon: Layers,
      description: "en mantenimiento",
      permission: "recetas" as keyof UserPermissions,
    },
    {
      id: "calculohorasprecios" as ActiveTab,
      name: "Cálculo precios",
      icon: Calculator,
      description: "Cálculo de horas y precios (planilla)",
      permission: "calculohorasprecios" as keyof UserPermissions,
    },
    {
      id: "supplierorders" as ActiveTab,
      name: "Órdenes Proveedor",
      icon: Truck,
      description: "Gestión de órdenes de proveedores",
      permission: "supplierorders" as keyof UserPermissions,
    },
    {
      id: "edit" as ActiveTab,
      name: "Mantenimiento",
      icon: Settings,
      description: "Gestión y mantenimiento del sistema",
      permission: "mantenimiento" as keyof UserPermissions,
    },
    {
      id: "histoscans" as ActiveTab,
      name: "Historial de Escaneos",
      icon: History,
      description: "Ver historial de escaneos realizados",
      permission: "scanhistory" as keyof UserPermissions,
    },
    {
      id: "solicitud" as ActiveTab,
      name: "Solicitud",
      icon: Type,
      description: "Solicitudes y trámites",
      permission: "solicitud" as keyof UserPermissions,
    },
  ];

  // Get user permissions or default if not available
  const userPermissions =
    user?.permissions || getDefaultPermissions(user?.role || "user");
  const canManageFondoGeneral = Boolean(userPermissions.fondogeneral);
  const canUseRecetas = Boolean(userPermissions.recetas);
  const canAgregarProducto = Boolean(userPermissions.agregarproductosdeli);
  const isFondoPrivileged =
    user?.role === "admin" || user?.role === "superadmin";
  const fondoMenuLabel = isFondoPrivileged ? "FG/Cuentas" : "Fondo General";

  const isFondoSection =
    currentHash === "#fondogeneral" ||
    currentHash === "#agregarproveedor" ||
    currentHash === "#reportes" ||
    currentHash === "#configuracion";

  const isRecetasSection =
    currentHash === "#recetas" || currentHash === "#agregarproducto";

  // Filter tabs based on user permissions
  const visibleTabs = allTabs.filter((tab) => {
    const hasPermission = userPermissions[tab.permission];
    return hasPermission;
  });

  const handleLogoutClick = () => {
    // Si estamos en /home, limpiar sesión especial y redirigir
    if (pathname === "/home") {
      // Limpiar la sesión especial del usuario SEBASTIAN
      localStorage.removeItem("pricemaster_session");
      localStorage.removeItem("pricemaster_session_id");
      window.location.href = "/";
    } else {
      // Para usuarios autenticados, mostrar modal de confirmación
      setShowLogoutConfirm(true);
    }
  };

  const handleTabClick = (tabId: ActiveTab) => {
    if (!isClient) return;

    // Para todas las páginas, usar hash normal
    const resolvedTabId = tabId === "recetas" ? "agregarproducto" : tabId;
    onTabChange?.(resolvedTabId);
    const hashId = resolvedTabId === "histoscans" ? "scanhistory" : resolvedTabId;
    window.location.hash = `#${hashId}`;
  };

  const handleUserDropdownClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (!showUserDropdown) {
      const button = event.currentTarget;
      const rect = button.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8, // 8px gap below button
        left: rect.left, // align to button's left edge
      });
    }
    setShowUserDropdown(!showUserDropdown);
  };

  const userInitials =
    user && ((user.fullName || user.name || "") as string)
      ? (
        (user.fullName || user.name || "")
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((p) => p[0])
          .slice(0, 2)
          .join("") || "U"
      ).toUpperCase()
      : "U";
  const roleLabel = user?.role
    ? user.role === "superadmin"
      ? "Superadmin"
      : user.role === "admin"
        ? "Administrador"
        : (user.role || "")
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
    : "";

  const handleConfirmLogout = async () => {
    if (!isClient) return;

    try {
      await logout();
      // Regresar al inicio después del logout
      window.location.href = "/";
    } catch (error) {
      console.error("Error during logout:", error);
    }
  };

  return (
    <>
      <header className="w-full border-b border-[var(--input-border)] bg-transparent backdrop-blur-sm relative overflow-hidden">
        {/* Main header row */}
        <div
          className="flex items-center justify-between p-4"
          suppressHydrationWarning
        >
          {/* Logo and title */}
          <a
            href="#"
            className="flex items-center gap-3 text-xl font-bold tracking-tight text-[var(--foreground)] hover:text-[var(--tab-text-active)] transition-colors cursor-pointer bg-transparent border-none p-0"
          >
            <Image
              src="/android-chrome-512x512.png"
              alt="Time Master Logo"
              width={32}
              height={32}
              className="rounded"
            />Time Master
          </a>

          {/* If we're on fondo-related sections, show quick actions in the header */}
          {isFondoSection && canManageFondoGeneral && (
            <nav className="hidden lg:flex items-center gap-1">
              {/* Agregar proveedor */}
              <button
                onClick={() => {
                  window.location.hash = "#agregarproveedor";
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors relative ${currentHash === "#agregarproveedor"
                  ? "text-[var(--tab-text-active)] font-semibold"
                  : "text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] hover:bg-[var(--hover-bg)]"
                  }`}
                title="Agregar proveedor"
              >
                <UserPlus className="w-4 h-4" />
                <span className="hidden xl:inline">Agregar proveedor</span>
                {currentHash === "#agregarproveedor" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--tab-text-active)] rounded-full"></div>
                )}
              </button>

              {/* Fondo */}
              <button
                onClick={() => {
                  window.location.hash = "#fondogeneral";
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors relative ${currentHash === "#fondogeneral"
                  ? "text-[var(--tab-text-active)] font-semibold"
                  : "text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] hover:bg-[var(--hover-bg)]"
                  }`}
                title={fondoMenuLabel}
              >
                <Banknote className="w-4 h-4" />
                <span className="hidden xl:inline">{fondoMenuLabel}</span>
                {currentHash === "#fondogeneral" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--tab-text-active)] rounded-full"></div>
                )}
              </button>

              {/* Reportes */}
              {isFondoPrivileged && (
                <button
                  onClick={() => {
                    window.location.hash = "#reportes";
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors relative ${currentHash === "#reportes"
                    ? "text-[var(--tab-text-active)] font-semibold"
                    : "text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] hover:bg-[var(--hover-bg)]"
                    }`}
                  title="Reportes"
                >
                  <Layers className="w-4 h-4" />
                  <span className="hidden xl:inline">Reportes</span>
                  {currentHash === "#reportes" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--tab-text-active)] rounded-full"></div>
                  )}
                </button>
              )}

              {/* Configuración */}
              {isFondoPrivileged && (
                <button
                  onClick={() => {
                    window.location.hash = "#configuracion";
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors relative ${currentHash === "#configuracion"
                    ? "text-[var(--tab-text-active)] font-semibold"
                    : "text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] hover:bg-[var(--hover-bg)]"
                    }`}
                  title="Configuración del fondo"
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden xl:inline">Configuración</span>
                  {currentHash === "#configuracion" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--tab-text-active)] rounded-full"></div>
                  )}
                </button>
              )}
            </nav>
          )}

          {/* If we're on recetas-related sections, show only recetas sub-navigation in the header */}
          {isRecetasSection && canUseRecetas && (
            <nav className="hidden lg:flex items-center gap-1">
              {canAgregarProducto && (
                <button
                  onClick={() => {
                    window.location.hash = "#agregarproducto";
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors relative ${currentHash === "#agregarproducto"
                    ? "text-[var(--tab-text-active)] font-semibold"
                    : "text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] hover:bg-[var(--hover-bg)]"
                    }`}
                  title="Agregar producto"
                >
                  <CustomIcon name="AddSquare" className="w-4 h-4" />
                  <span className="hidden xl:inline">Agregar Productos</span>
                  {currentHash === "#agregarproducto" && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--tab-text-active)] rounded-full"></div>
                  )}
                </button>
              )}
              {/* Recetas */}
              <button
                onClick={() => {
                  window.location.hash = "#recetas";
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors relative ${currentHash === "#recetas"
                  ? "text-[var(--tab-text-active)] font-semibold"
                  : "text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] hover:bg-[var(--hover-bg)]"
                  }`}
                title="Recetas"
              >
                <CustomIcon name="FoodAndSoda" className="w-4 h-4" />
                <span className="hidden xl:inline">Recetas</span>
                {currentHash === "#recetas" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--tab-text-active)] rounded-full"></div>
                )}
              </button>
            </nav>
          )}

          {/* Desktop navigation tabs - only show when inside a card and NOT in fondogeneral/agregarproveedor/reportes */}
          {activeTab &&
            activeTab !== "fondogeneral" &&
            activeTab !== "agregarproveedor" &&
            activeTab !== "reportes" &&
            activeTab !== "recetas" &&
            activeTab !== "agregarproducto" &&
            visibleTabs.length > 0 && (
              <nav className="hidden lg:flex items-center gap-1">
                {visibleTabs.map((tab) => {
                  const IconComponent = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleTabClick(tab.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors relative ${activeTab === tab.id
                        ? "text-[var(--tab-text-active)] font-semibold"
                        : "text-[var(--tab-text)] hover:text-[var(--tab-hover-text)] hover:bg-[var(--hover-bg)]"
                        }`}
                      title={tab.description}
                    >
                      <IconComponent className="w-4 h-4" />
                      <span className="hidden xl:inline">{tab.name}</span>
                      {activeTab === tab.id && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--tab-text-active)] rounded-full"></div>
                      )}
                    </button>
                  );
                })}
              </nav>
            )}

          <div className="flex items-center gap-2" suppressHydrationWarning>
            {/* User dropdown menu - solo mostrar si hay usuario O si estamos en /home */}
            {(user || pathname === "/home") && (
              <div className="hidden md:flex items-center gap-2">
                {/* User button with dropdown - solo si hay usuario autenticado */}
                {user && (
                  <div className="relative" style={{ zIndex: "auto" }}>
                    <div className="relative inline-block">
                      <button
                        onClick={handleUserDropdownClick}
                        className={`flex items-center gap-3 px-3 py-2 bg-transparent rounded-lg border border-[var(--input-border)] hover:bg-[var(--hover-bg)] transition-colors`}
                      >
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden"
                          style={{ backgroundColor: "var(--primary)" }}
                        >
                          {(user as any)?.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={(user as any).photoUrl}
                              alt="avatar"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-sm font-semibold text-[var(--button-text)]">
                              {userInitials}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col items-start leading-tight">
                          <span className="text-sm font-semibold text-[var(--foreground)]">
                            {user.name}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--muted-foreground)]">
                            {user?.role === "superadmin" ? (
                              <Star className="w-3 h-3 text-[var(--muted-foreground)]" />
                            ) : user?.role === "admin" ? (
                              <Shield className="w-3 h-3 text-[var(--muted-foreground)]" />
                            ) : (
                              <User className="w-3 h-3 text-[var(--muted-foreground)]" />
                            )}
                            <span>{roleLabel}</span>
                          </div>
                        </div>

                        <ChevronDown
                          className={`w-4 h-4 text-[var(--muted-foreground)] ml-2 transition-transform ${showUserDropdown ? "rotate-180" : ""
                            }`}
                        />
                      </button>
                    </div>

                    {/* Dropdown menu - rendered in portal */}
                    {showUserDropdown &&
                      isClient &&
                      createPortal(
                        <>
                          {/* Click outside to close dropdown */}
                          <div
                            className="fixed inset-0"
                            style={{ zIndex: 2147483646 }} // One less than dropdown
                            onClick={() => setShowUserDropdown(false)}
                          />

                          {/* Dropdown content */}
                          <div
                            className="min-w-[12rem] bg-transparent backdrop-blur-sm border border-[var(--input-border)] rounded-lg shadow-lg overflow-hidden"
                            style={{
                              position: "fixed",
                              top: dropdownPosition.top,
                              left: dropdownPosition.left,
                              zIndex: 2147483647,
                              isolation: "isolate",
                              transform: "translateZ(0)",
                              willChange: "transform",
                              pointerEvents: "auto",
                            }}
                          >
                            <div className="flex flex-col py-1">
                              <button
                                onClick={() => {
                                  setShowEditProfileModal(true);
                                  setShowUserDropdown(false);
                                }}
                                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--hover-bg)] transition-colors"
                              >
                                <User className="w-4 h-4 text-[var(--muted-foreground)]" />
                                <span className="truncate">Editar Perfil</span>
                              </button>

                              <button
                                onClick={() => {
                                  setShowConfigModal(true);
                                  setShowUserDropdown(false);
                                }}
                                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--hover-bg)] transition-colors"
                              >
                                <Settings className="w-4 h-4 text-[var(--muted-foreground)]" />
                                <span className="truncate">
                                  Configuración de Sesión
                                </span>
                              </button>
                              <button
                                onClick={() => {
                                  setShowUserDropdown(false);
                                  window.location.reload();
                                }}
                                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--hover-bg)] transition-colors"
                              >
                                <RefreshCw className="w-4 h-4 text-[var(--muted-foreground)]" />
                                <span className="truncate">Sincronizar</span>
                              </button>
                              <button
                                onClick={() => {
                                  setShowUserDropdown(false);
                                  const sessionKey = "pricemaster_session";
                                  const sessionValue =
                                    localStorage.getItem(sessionKey);
                                  localStorage.clear();
                                  if (sessionValue !== null) {
                                    localStorage.setItem(
                                      sessionKey,
                                      sessionValue
                                    );
                                  }
                                  window.location.reload();
                                }}
                                className="flex items-center gap-3 w-full px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--hover-bg)] transition-colors"
                              >
                                <Trash2 className="w-4 h-4 text-[var(--muted-foreground)]" />
                                <span className="truncate">Limpiar Cache</span>
                              </button>
                            </div>
                          </div>
                        </>,
                        document.body
                      )}
                  </div>
                )}

                {/* Logout button - separate from dropdown */}
                <button
                  onClick={handleLogoutClick}
                  className="p-2 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  title="Cerrar Sesión"
                >
                  <LogOut className="w-4 h-4 text-red-600 dark:text-red-400" />
                </button>
              </div>
            )}

            {/* Notification icon for small screens (left of hamburger) */}
            <button
              onClick={() => {
                try {
                  if (user) {
                    const key = `pricemaster_last_seen_solicitudes_${user.id || user.ownercompanie || "anon"
                      }`;
                    localStorage.setItem(key, new Date().toISOString());
                    setHasNewSolicitudes(false);
                  }
                } catch {
                  // ignore storage errors
                }
                setShowNotifModal(true);
              }}
              className="relative p-2 rounded-md hover:bg-[var(--hover-bg)] transition-colors"
              title="Notificaciones"
            >
              <Bell className="w-5 h-5 text-[var(--foreground)]" />
              {hasNewSolicitudes && (
                <span className="absolute top-0 right-0 inline-flex w-2 h-2 bg-red-500 rounded-full transform translate-x-1 -translate-y-1" />
              )}
            </button>

            {/* Mobile hamburger menu button */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="lg:hidden p-2 rounded-md hover:bg-[var(--hover-bg)] transition-colors"
              title="Menú"
            >
              {showMobileMenu ? (
                <X className="w-5 h-5 text-[var(--foreground)]" />
              ) : (
                <Menu className="w-5 h-5 text-[var(--foreground)]" />
              )}
            </button>

            <ThemeToggle />
          </div>
        </div>

        {/* Mobile navigation menu */}
        {showMobileMenu && (
          <div className="lg:hidden border-t border-[var(--input-border)] bg-[var(--background)] p-4">
            {/* Main tabs - only show when NOT in fondo sections */}
            {!isFondoSection && !isRecetasSection && (
              <div className="grid grid-cols-2 gap-2">
                {visibleTabs.map((tab) => {
                  const IconComponent = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        handleTabClick(tab.id);
                        setShowMobileMenu(false);
                      }}
                      className={`flex items-center gap-2 p-3 rounded-md text-sm transition-colors ${activeTab === tab.id
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)]"
                        }`}
                    >
                      <IconComponent className="w-4 h-4" />
                      <span>{tab.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Mobile fondo general navigation */}
            {isFondoSection && canManageFondoGeneral && (
              <div className="grid grid-cols-2 gap-2">
                {/* Agregar proveedor */}
                <button
                  onClick={() => {
                    window.location.hash = "#agregarproveedor";
                    setShowMobileMenu(false);
                  }}
                  className={`flex items-center gap-2 p-3 rounded-md text-sm transition-colors ${currentHash === "#agregarproveedor"
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)]"
                    }`}
                  title="Agregar proveedor"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Agregar proveedor</span>
                </button>

                {/* Fondo */}
                <button
                  onClick={() => {
                    window.location.hash = "#fondogeneral";
                    setShowMobileMenu(false);
                  }}
                  className={`flex items-center gap-2 p-3 rounded-md text-sm transition-colors ${currentHash === "#fondogeneral"
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)]"
                    }`}
                  title={fondoMenuLabel}
                >
                  <Banknote className="w-4 h-4" />
                  <span>{fondoMenuLabel}</span>
                </button>

                {/* Reportes */}
                {isFondoPrivileged && (
                  <button
                    onClick={() => {
                      window.location.hash = "#reportes";
                      setShowMobileMenu(false);
                    }}
                    className={`flex items-center gap-2 p-3 rounded-md text-sm transition-colors ${currentHash === "#reportes"
                      ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)]"
                      }`}
                    title="Reportes"
                  >
                    <Layers className="w-4 h-4" />
                    <span>Reportes</span>
                  </button>
                )}

                {/* Configuración */}
                {isFondoPrivileged && (
                  <button
                    onClick={() => {
                      window.location.hash = "#configuracion";
                      setShowMobileMenu(false);
                    }}
                    className={`flex items-center gap-2 p-3 rounded-md text-sm transition-colors ${currentHash === "#configuracion"
                      ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)]"
                      }`}
                    title="Configuración del fondo"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Configuración</span>
                  </button>
                )}
              </div>
            )}

            {/* Mobile recetas navigation */}
            {isRecetasSection && canUseRecetas && (
              <div className="grid grid-cols-2 gap-2">
                {/* Recetas */}
                <button
                  onClick={() => {
                    window.location.hash = "#recetas";
                    setShowMobileMenu(false);
                  }}
                  className={`flex items-center gap-2 p-3 rounded-md text-sm transition-colors ${currentHash === "#recetas"
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)]"
                    }`}
                  title="Recetas"
                >
                  <Layers className="w-4 h-4" />
                  <span>Recetas</span>
                </button>

                {/* Agregar producto (en mantenimiento) */}
                {canAgregarProducto && (
                  <button
                    onClick={() => {
                      window.location.hash = "#agregarproducto";
                      setShowMobileMenu(false);
                    }}
                    className={`flex items-center gap-2 p-3 rounded-md text-sm transition-colors ${currentHash === "#agregarproducto"
                      ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)]"
                      }`}
                    title="Agregar producto"
                  >
                    <Plus className="w-4 h-4" />
                    <span>en mantenimiento</span>
                  </button>
                )}
              </div>
            )}

            {/* Mobile user section */}
            {user && (
              <div className="mt-4 pt-4 border-t border-[var(--input-border)]">
                <div className="flex items-start justify-between">
                  <div className="flex gap-3 items-center">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden"
                      style={{ backgroundColor: "var(--primary)" }}
                    >
                      {(user as any)?.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={(user as any).photoUrl}
                          alt="avatar"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-sm font-semibold text-[var(--button-text)]">
                          {userInitials}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col">
                      <span className="font-medium text-[var(--foreground)]">
                        {user.name}
                      </span>
                      <div className="flex items-center gap-2 mt-1 text-xs text-[var(--muted-foreground)]">
                        {user?.role === "superadmin" ? (
                          <Star className="w-3 h-3 text-[var(--muted-foreground)]" />
                        ) : user?.role === "admin" ? (
                          <Shield className="w-3 h-3 text-[var(--muted-foreground)]" />
                        ) : (
                          <User className="w-3 h-3 text-[var(--muted-foreground)]" />
                        )}
                        <span>{roleLabel}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setShowEditProfileModal(true);
                        setShowMobileMenu(false);
                      }}
                      className="p-2 rounded-md hover:bg-[var(--hover-bg)] transition-colors"
                      title="Editar Perfil"
                    >
                      <User className="w-4 h-4 text-[var(--muted-foreground)]" />
                    </button>

                    <button
                      onClick={() => {
                        setShowConfigModal(true);
                        setShowMobileMenu(false);
                      }}
                      className="p-2 rounded-md hover:bg-[var(--hover-bg)] transition-colors"
                      title="Configuración de Sesión"
                    >
                      <Settings className="w-4 h-4 text-[var(--muted-foreground)]" />
                    </button>
                    <button
                      onClick={() => {
                        setShowMobileMenu(false);
                        handleLogoutClick();
                      }}
                      className="p-2 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                      title="Cerrar Sesión"
                    >
                      <LogOut className="w-4 h-4 text-red-600 dark:text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-[var(--background)] rounded-lg p-6 w-96 max-w-[90vw]">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">
              Confirmar Cierre de Sesión
            </h3>
            <p className="text-[var(--muted-foreground)] mb-6">
              ¿Estás seguro de que quieres cerrar tu sesión?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 text-[var(--foreground)] hover:bg-[var(--hover-bg)] rounded-md transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmLogout}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification modal (small screens) - now uses NotificationModal from modals folder */}
      <NotificationModal
        isOpen={showNotifModal}
        onClose={() => setShowNotifModal(false)}
        onSave={async (payload) => {
          // Default behaviour for now: just log the payload. You can replace with any action.
        }}
      />

      {/* Configuration Modal */}
      <ConfigurationModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        showSessionTimer={showSessionTimer}
        onToggleSessionTimer={setShowSessionTimer}
        showCalculator={showCalculator}
        onToggleCalculator={setShowCalculator}
        showSupplierWeekInMenu={showSupplierWeekInMenu}
        onToggleSupplierWeekInMenu={setShowSupplierWeekInMenu}
        enableHomeMenuSortMobile={enableHomeMenuSortMobile}
        onToggleHomeMenuSortMobile={setEnableHomeMenuSortMobile}
        onLogoutClick={handleLogoutClick}
      />

      <EditProfileModal
        isOpen={showEditProfileModal}
        onClose={() => setShowEditProfileModal(false)}
      />

      {/* FloatingSessionTimer */}
      <FloatingSessionTimer
        visible={showSessionTimer}
        onToggleVisibility={() => setShowSessionTimer(false)}
        // Evitar solape vertical si la calculadora global está activa
        // y dejar más aire en CashCounter por sus propios FABs
        avoidOverlap={showCalculator || activeTab === "cashcounter"}
        sideOffsetClass={activeTab === "cashcounter" ? "right-6" : undefined}
        bottomOffsetClass={
          activeTab === "cashcounter" ? "bottom-10 md:bottom-12" : undefined
        }
      />

      {/* Global Calculator Button */}
      {showCalculator && activeTab !== "cashcounter" && (
        <button
          onClick={() => setShowCalculatorModal(true)}
          className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full w-16 h-16 flex items-center justify-center shadow-xl z-40 transition-colors"
          aria-label="Abrir calculadora"
        >
          <Calculator className="w-6 h-6" />
        </button>
      )}

      {/* Global Calculator Modal */}
      <CalculatorModal
        isOpen={showCalculatorModal}
        onClose={() => setShowCalculatorModal(false)}
      />
    </>
  );
}
