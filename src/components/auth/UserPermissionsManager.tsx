'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useActorOwnership } from '../../hooks/useActorOwnership';
import { User, UserPermissions } from '../../types/firestore';
import { UsersService } from '../../services/users';
import { EmpresasService } from '../../services/empresas';
import { getDefaultPermissions, getAllPermissions, getNoPermissions } from '../../utils/permissions';

interface UserPermissionsManagerProps {
  userId?: string;
  onClose?: () => void;
}

const PERMISSION_LABELS = {
  scanner: 'Escáner',
  calculator: 'Calculadora',
  converter: 'Conversor',
  xml: 'XML',
  cashcounter: 'Contador Efectivo',
  recetas: 'Recetas',
  notificaciones: 'Notificaciones',
  agregarproductosdeli: 'Agregar productos deli',
  timingcontrol: 'Control Tiempos',
  controlhorario: 'Control Horario',
  empleados: 'Empleados',
  calculohorasprecios: 'Calculo horas precios',
  supplierorders: 'Órdenes Proveedor',
  mantenimiento: 'Mantenimiento',
  fondogeneral: 'Fondo General',
  fondogeneralBCR: 'Fondo General - BCR',
  fondogeneralBN: 'Fondo General - BN',
  fondogeneralBAC: 'Fondo General - BAC',
  solicitud: 'Solicitud',
  scanhistory: 'Historial de Escaneos',
};

const PERMISSION_DESCRIPTIONS = {
  scanner: 'Escanear códigos de barras',
  calculator: 'Calcular precios con descuentos',
  converter: 'Convertir y transformar texto',
  xml: 'Generar y exportar XML',
  cashcounter: 'Contar billetes y monedas',
  recetas: 'Manipular recetas (crear, editar, eliminar)',
  notificaciones: 'Acceso a notificaciones del sistema (sin tarjeta)',
  agregarproductosdeli: 'Permite agregar productos deli (sin tarjeta)',
  timingcontrol: 'Registro de venta de tiempos',
  controlhorario: 'Registro de horarios de trabajo',
  empleados: 'Acceso a la sección de Empleados',
  calculohorasprecios: 'Cálculo de horas y precios (planilla)',
  supplierorders: 'Gestión de órdenes de proveedores',
  mantenimiento: 'Acceso al panel de administración',
  fondogeneral: 'Permiso para ver y administrar el fondo general de la compañía',
  fondogeneralBCR: 'Permite registrar movimientos del fondo general para la cuenta BCR',
  fondogeneralBN: 'Permite registrar movimientos del fondo general para la cuenta BN',
  fondogeneralBAC: 'Permite registrar movimientos del fondo general para la cuenta BAC',
  solicitud: 'Permite gestionar solicitudes dentro del módulo de mantenimiento',
  scanhistory: 'Ver historial completo de escaneos realizados',
};

export default function UserPermissionsManager({ userId, onClose }: UserPermissionsManagerProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions>(getNoPermissions());
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const { user: currentUser } = useAuth();
  const { ownerIds: actorOwnerIds } = useActorOwnership(currentUser);

  const loadUsers = React.useCallback(async () => {
    setLoading(true);
    try {
      const allUsers = await UsersService.getAllUsersAs(currentUser);
      if (currentUser && currentUser.role !== 'superadmin') {
        const allowed = new Set(actorOwnerIds.map(id => String(id)));
        if (allowed.size > 0) {
          const filtered = allUsers.filter(user => {
            if (!user) return false;
            if (user.id && currentUser.id && String(user.id) === String(currentUser.id)) return true;
            if (!user.ownerId) return false;
            return allowed.has(String(user.ownerId));
          });
          setUsers(filtered);
          return;
        }
      }
      setUsers(allUsers);
    } catch (error) {
      console.error('Error loading users:', error);
      setMessage({ type: 'error', text: 'Error al cargar usuarios' });
    } finally {
      setLoading(false);
    }
  }, [actorOwnerIds, currentUser]);

  const loadLocations = React.useCallback(async () => {
    try {
      const empresasData = await EmpresasService.getAllEmpresas();
      let filtered = empresasData;
      if (currentUser && currentUser.role !== 'superadmin') {
        const allowed = new Set(actorOwnerIds.map(id => String(id)));
        if (allowed.size > 0) {
          filtered = empresasData.filter(empresa => empresa && empresa.ownerId && allowed.has(String(empresa.ownerId)));
        }
      }
      setEmpresas(filtered.map(empresa => ({
        label: empresa.name,
        value: empresa.name.toLowerCase(),
        names: []
      })));
    } catch (error) {
      console.error('Error loading empresas from DB, using fallback list:', error);
      // Fallback locations if service can't be reached
      setEmpresas([
        { label: 'PALMARES', value: 'palmares', names: [] },
        { label: 'SINAI', value: 'sinai', names: [] },
        { label: 'SAN VITO', value: 'san vito', names: [] },
        { label: 'COOPABUENA', value: 'coopabuena', names: [] },
        { label: 'DELIFOOD TEST', value: 'delifood test', names: [] }
      ]);
    }
  }, [actorOwnerIds, currentUser]);

  const loadEmpresas = React.useCallback(async () => {
    try {
      const empresasData = await EmpresasService.getAllEmpresas();
      if (currentUser && currentUser.role !== 'superadmin') {
        const allowed = new Set(actorOwnerIds.map(id => String(id)));
        if (allowed.size > 0) {
          setEmpresas(empresasData.filter(empresa => empresa && empresa.ownerId && allowed.has(String(empresa.ownerId))));
          return;
        }
      }
      setEmpresas(empresasData);
    } catch (error) {
      console.error('Error loading empresas, using fallback empty list:', error);
      setEmpresas([]);
    }
  }, [actorOwnerIds, currentUser]);

  useEffect(() => {
    loadUsers();
    loadLocations();
    loadEmpresas();
  }, [loadUsers, loadLocations, loadEmpresas]);

  useEffect(() => {
    if (userId && users.length > 0) {
      const found = users.find(u => u.id === userId);
      if (found) {
        setSelectedUser(found);
        setPermissions(found.permissions || getDefaultPermissions(found.role));
      } else {
        // If the provided userId is not in the visible list, likely the current
        // user doesn't have permission to view that user (e.g. admin attempting
        // to view a superadmin). Clear selection and show a message.
        setSelectedUser(null);
        setMessage({ type: 'error', text: 'No tienes permiso para ver ese usuario o no existe.' });
      }
    }
  }, [userId, users]);

  // ...existing code...

  const handleUserChange = (user: User) => {
    setSelectedUser(user);
    setPermissions(user.permissions || getDefaultPermissions(user.role));
  };

  const handlePermissionChange = (permission: keyof UserPermissions, value: boolean) => {
    setPermissions(prev => {
      const updated = {
        ...prev,
        [permission]: value
      };

      // If scanhistory is being disabled, clear the empresas selection
      if (permission === 'scanhistory' && !value) {
        updated.scanhistoryEmpresas = [];
      }

      return updated;
    });
  };

  const handleEmpresaChange = (empresaName: string, isSelected: boolean) => {
    setPermissions(prev => {
      const current = prev.scanhistoryEmpresas || [];
      const newList = isSelected ? [...current, empresaName] : current.filter(e => e !== empresaName);
      return {
        ...prev,
        scanhistoryEmpresas: newList
      };
    });
  };

  const handleSave = async () => {
    if (!selectedUser?.id) return;

    setSaving(true);
    try {
      await UsersService.updateUserPermissions(selectedUser.id, permissions);
      setMessage({ type: 'success', text: 'Permisos actualizados correctamente' });

      // Update local state
      setUsers(prev => prev.map(u =>
        u.id === selectedUser.id
          ? { ...u, permissions }
          : u
      ));
    } catch (error) {
      console.error('Error updating permissions:', error);
      setMessage({ type: 'error', text: 'Error al actualizar permisos' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = () => {
    if (!selectedUser) return;
    const defaultPerms = getDefaultPermissions(selectedUser.role);
    setPermissions(defaultPerms);
  };

  const handleSelectAll = () => {
    const allPermissions = getAllPermissions();
    // When selecting all, include all available empresas for scanhistory
    allPermissions.scanhistoryEmpresas = empresas.map(e => e.name);
    setPermissions(allPermissions);
  };

  const handleSelectNone = () => {
    setPermissions(getNoPermissions());
  };

  const migrateAllUsers = async () => {
    setLoading(true);
    try {
      const result = await UsersService.migrateUsersPermissions();
      setMessage({
        type: 'success',
        text: `Migración completada: ${result.updated} usuarios actualizados, ${result.skipped} omitidos`
      });
      await loadUsers(); // Reload users to see changes
    } catch (error) {
      console.error('Error migrating users:', error);
      setMessage({ type: 'error', text: 'Error en la migración de usuarios' });
    } finally {
      setLoading(false);
    }
  };

  const ensureAllPermissions = async () => {
    setLoading(true);
    try {
      const result = await UsersService.ensureAllPermissions();
      setMessage({
        type: 'success',
        text: `Permisos actualizados: ${result.updated} usuarios actualizados, ${result.skipped} ya estaban al día`
      });
      await loadUsers(); // Reload users to see changes
    } catch (error) {
      console.error('Error ensuring all permissions:', error);
      setMessage({ type: 'error', text: 'Error al actualizar permisos de usuarios' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Administrar Permisos de Usuario</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            ✕
          </button>
        )}
      </div>

      {message && (
        <div className={`p-3 rounded mb-4 ${message.type === 'success'
          ? 'bg-green-100 text-green-700 border border-green-300'
          : 'bg-red-100 text-red-700 border border-red-300'
          }`}>
          {message.text}
        </div>
      )}

      {/* Migration Buttons */}
      <div className="mb-6 p-4 bg-[var(--muted)] border border-[var(--border)] rounded">
        <h3 className="font-semibold mb-2">Gestión de Permisos</h3>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-[var(--muted-foreground)] mb-2">
              Agrega permisos predeterminados a usuarios que no los tienen configurados.
            </p>
            <button
              onClick={migrateAllUsers}
              disabled={loading}
              className="px-4 py-2 bg-[var(--primary)] text-white rounded hover:bg-[var(--button-hover)] disabled:opacity-50"
            >
              Migrar Usuarios Nuevos
            </button>
          </div>
          <div>
            <p className="text-sm text-[var(--muted-foreground)] mb-2">
              Actualiza todos los usuarios para asegurar que tengan todos los permisos disponibles (útil cuando se agregan nuevos permisos).
            </p>
            <button
              onClick={ensureAllPermissions}
              disabled={loading}
              className="px-4 py-2 bg-[var(--success)] text-white rounded hover:bg-[var(--button-hover)] disabled:opacity-50"
            >
              Actualizar Permisos Existentes
            </button>
          </div>
        </div>
      </div>

      {/* User Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Seleccionar Usuario:</label>
        <select
          value={selectedUser?.id || ''}
          onChange={(e) => {
            const user = users.find(u => u.id === e.target.value);
            if (user) handleUserChange(user);
          }}
          className="w-full p-2 border border-[var(--border)] rounded focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] bg-[var(--input-bg)]"
        >
          <option value="">-- Seleccionar Usuario --</option>
          {users.map(user => (
            <option key={user.id} value={user.id}>
              {user.name} ({user.role}) - {user.ownercompanie}
            </option>
          ))}
        </select>
      </div>

      {selectedUser && (
        <>
          {/* User Info */}
          <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded">
            <h3 className="font-semibold mb-2">Información del Usuario</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p><strong>Nombre:</strong> {selectedUser.name}</p>
                <p><strong>Rol:</strong> {selectedUser.role}</p>
                <p><strong>Empresa asignada:</strong> {selectedUser.ownercompanie}</p>
                <p><strong>Estado:</strong> {selectedUser.isActive ? 'Activo' : 'Inactivo'}</p>
              </div>
              <div>
                <h4 className="font-medium mb-2">Permisos Actuales:</h4>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(selectedUser.permissions || getDefaultPermissions(selectedUser.role))
                    .filter(([, hasAccess]) => hasAccess)
                    .map(([permission]) => (
                      <span
                        key={permission}
                        className="text-xs bg-[var(--badge-bg)] text-[var(--badge-text)] px-2 py-1 rounded border border-[var(--border)]"
                      >
                        {PERMISSION_LABELS[permission as keyof typeof PERMISSION_LABELS]}
                      </span>
                    ))
                  }
                  {Object.values(selectedUser.permissions || getDefaultPermissions(selectedUser.role))
                    .filter(Boolean).length === 0 && (
                      <span className="text-xs text-[var(--muted-foreground)] italic">Sin permisos activos</span>
                    )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Acciones Rápidas</h3>
              <div className="text-sm text-gray-600">
                Rol: <strong>{selectedUser.role}</strong>
                <span className="ml-2 text-xs bg-gray-100 px-2 py-1 rounded">
                  {selectedUser.role === 'superadmin' ? 'Acceso total' :
                    selectedUser.role === 'admin' ? 'Acceso amplio' : 'Acceso básico'}
                </span>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleSelectAll}
                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
              >
                Seleccionar Todo
              </button>
              <button
                onClick={handleSelectNone}
                className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
              >
                Deseleccionar Todo
              </button>
              <button
                onClick={handleResetToDefault}
                className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-700"
              >
                Permisos por Defecto
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-600">
              <strong>Permisos predeterminados para {selectedUser.role}:</strong>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(getDefaultPermissions(selectedUser.role))
                  .filter(([, hasAccess]) => hasAccess)
                  .map(([permission]) => (
                    <span
                      key={permission}
                      className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
                    >
                      {PERMISSION_LABELS[permission as keyof typeof PERMISSION_LABELS]}
                    </span>
                  ))
                }
              </div>
            </div>
          </div>

          {/* Permissions Grid */}
          <div className="mb-6">
            <h3 className="font-semibold mb-4">Permisos de Secciones</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                <div key={key} className="flex items-start p-3 border border-[var(--border)] rounded">
                  <input
                    type="checkbox"
                    id={key}
                    checked={Boolean(permissions[key as keyof typeof PERMISSION_LABELS])}
                    onChange={(e) => handlePermissionChange(key as keyof UserPermissions, e.target.checked)}
                    className="mr-3 h-4 w-4 text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--border)] rounded mt-1"
                  />
                  <label htmlFor={key} className="flex-1 text-sm cursor-pointer">
                    <div className="font-medium">{label}</div>
                    <div className="text-xs text-[var(--muted-foreground)] mt-1">
                      {PERMISSION_DESCRIPTIONS[key as keyof typeof PERMISSION_DESCRIPTIONS]}
                    </div>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Scan History Locations Selection */}
          {permissions.scanhistory && (
            <div className="mb-6 p-4 bg-[var(--muted)] border border-[var(--border)] rounded">
              <h3 className="font-semibold mb-4">Locaciones para Historial de Escaneos</h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-4">
                Selecciona las locaciones específicas a las que este usuario tendrá acceso en el historial de escaneos.
                Si no se selecciona ninguna, tendrá acceso a todas las locaciones.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {empresas.map((empresa) => (
                  <div key={empresa.id || empresa.name} className="flex items-center p-2 border border-[var(--border)] rounded">
                    <input
                      type="checkbox"
                      id={`empresa-${empresa.name}`}
                      checked={permissions.scanhistoryEmpresas?.includes(empresa.name) || false}
                      onChange={(e) => handleEmpresaChange(empresa.name, e.target.checked)}
                      className="mr-3 h-4 w-4 text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--border)] rounded"
                    />
                    <label htmlFor={`empresa-${empresa.name}`} className="text-sm cursor-pointer">
                      {empresa.name}
                    </label>
                  </div>
                ))}
              </div>
              {permissions.scanhistoryEmpresas && permissions.scanhistoryEmpresas.length > 0 && (
                <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded">
                  <p className="text-sm text-green-700">
                    <strong>Empresas seleccionadas:</strong> {permissions.scanhistoryEmpresas.join(', ')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-[var(--primary)] text-white rounded hover:bg-[var(--button-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : 'Guardar Permisos'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
