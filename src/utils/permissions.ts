import { UserPermissions } from '../types/firestore';

type RoleKey = 'admin' | 'user' | 'superadmin';

const coerceBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'si' || s === 'sí' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
  }
  return undefined;
};

/**
 * Normaliza permisos provenientes de Firestore/sesión.
 * - Completa keys faltantes usando defaults por rol
 *
 * Nota: El sistema debe usar únicamente `agregarproductosdeli`. Cualquier
 * key legacy (ej. `agregaproductodeli`) debe migrarse a nivel de datos.
 */
export function normalizeUserPermissions(
  raw: unknown,
  role: RoleKey = 'user'
): UserPermissions {
  const base = getDefaultPermissions(role);
  if (!raw || typeof raw !== 'object') {
    return base;
  }

  const obj = raw as Record<string, unknown>;
  const out: UserPermissions = { ...base };

  for (const key of Object.keys(base) as Array<keyof UserPermissions>) {
    if (!Object.prototype.hasOwnProperty.call(obj, key as string)) continue;
    if (key === 'scanhistoryEmpresas') {
      const val = obj[key as string];
      out.scanhistoryEmpresas = Array.isArray(val)
        ? (val.filter((x) => typeof x === 'string') as string[])
        : [];
      continue;
    }

    const coerced = coerceBoolean(obj[key as string]);
    if (coerced !== undefined) {
      (out as any)[key] = coerced;
    }
  }

  return out;
}

/**
 * Default permissions for different user roles
 */
export const DEFAULT_PERMISSIONS: Record<string, UserPermissions> = {
  superadmin: {
    scanner: true,
    calculator: true,
    converter: true,
    xml: false,
    cashcounter: true,
    recetas: true,
    notificaciones: true,
    agregarproductosdeli: true,
    timingcontrol: true,
    controlhorario: true,
    calculohorasprecios: true,
    empleados: true,
    supplierorders: true,
    mantenimiento: true,
    fondogeneral: true,
    fondogeneralBCR: true,
    fondogeneralBN: true,
    fondogeneralBAC: true,
    solicitud: true,
    scanhistory: true,
    scanhistoryEmpresas: [],
  },
  // Admins now receive the same default configuration as SuperAdmins
  admin: {
    scanner: true,
    calculator: true,
    converter: true,
    xml: false,
    cashcounter: true,
    recetas: true,
    notificaciones: true,
    agregarproductosdeli: true,
    timingcontrol: true,
    controlhorario: true,
    calculohorasprecios: true,
    empleados: true,
    supplierorders: true,
    mantenimiento: true,
    fondogeneral: true,
    fondogeneralBCR: true,
    fondogeneralBN: true,
    fondogeneralBAC: true,
    solicitud: true,
    scanhistory: true,
    scanhistoryEmpresas: [],
  },
  user: {
    scanner: false,
    calculator: true,
    converter: false,
    xml: false,
    cashcounter: true,
    recetas: false,
    notificaciones: false,
    agregarproductosdeli: false,
    timingcontrol: true,
    controlhorario: true,
    calculohorasprecios: true,
    empleados: false,
    supplierorders: false,
    mantenimiento: false,
    fondogeneral: false,
    fondogeneralBCR: false,
    fondogeneralBN: false,
    fondogeneralBAC: false,
    solicitud: false,
    scanhistory: false,
    scanhistoryEmpresas: [],
  },
};

/**
 * Get default permissions for a specific role
 */
export function getDefaultPermissions(role: 'admin' | 'user' | 'superadmin' = 'user'): UserPermissions {
  return { ...DEFAULT_PERMISSIONS[role] };
}

/**
 * Create permissions with all sections enabled
 */
export function getAllPermissions(): UserPermissions {
  return {
    scanner: true,
    calculator: true,
    converter: true,
    xml: false,
    cashcounter: true,
    recetas: true,
    notificaciones: true,
    agregarproductosdeli: true,
    timingcontrol: true,
    controlhorario: true,
    calculohorasprecios: true,
    empleados: true,
    supplierorders: true,
    mantenimiento: true,
    fondogeneral: true,
    fondogeneralBCR: true,
    fondogeneralBN: true,
    fondogeneralBAC: true,
    solicitud: true,
    scanhistory: true,
    scanhistoryEmpresas: [],
  };
}

/**
 * Create permissions with all sections disabled
 */
export function getNoPermissions(): UserPermissions {
  return {
    scanner: false,
    calculator: false,
    converter: false,
    xml: false,
    cashcounter: false,
    recetas: false,
    notificaciones: false,
    agregarproductosdeli: false,
    timingcontrol: false,
    controlhorario: false,
    calculohorasprecios: false,
    empleados: false,
    supplierorders: false,
    mantenimiento: false,
    fondogeneral: false,
    fondogeneralBCR: false,
    fondogeneralBN: false,
    fondogeneralBAC: false,
    solicitud: false,
    scanhistory: false,
    scanhistoryEmpresas: [],
  };
}

/**
 * Update specific permissions while keeping others intact
 */
export function updatePermissions(
  currentPermissions: UserPermissions | undefined,
  updates: Partial<UserPermissions>
): UserPermissions {
  const current = currentPermissions || getNoPermissions();
  return {
    ...current,
    ...updates,
  };
}

/**
 * Check if user has permission for a specific section
 */
export function hasPermission(
  permissions: UserPermissions | undefined,
  section: keyof UserPermissions
): boolean {
  return permissions?.[section] === true;
}
