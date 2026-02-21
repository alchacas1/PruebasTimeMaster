"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import {
  UserPlus,
  Plus,
  Pencil,
  Trash2,
  X,
  Banknote,
  Clock,
  Layers,
  Tag,
  FileText,
  UserCircle,
  ArrowUpDown,
  ArrowUpRight,
  ArrowDownRight,
  Lock,
  LockOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  AlertTriangle,
  CheckCircle,
  Mail,
} from "lucide-react";
import { useAuth } from "../../../hooks/useAuth";
import { useProviders } from "../../../hooks/useProviders";
import useToast from "../../../hooks/useToast";
import type {
  UserPermissions,
  Empresas,
  User,
} from "../../../types/firestore";
import { getDefaultPermissions } from "../../../utils/permissions";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import DailyClosingHistoryModal from "../../../components/modals/DailyClosingHistoryModal";
import { EmpresasService } from "../../../services/empresas";
import { UsersService } from "../../../services/users";
import { FondoMovementTypesService } from "../../../services/fondo-movement-types";
import { SchedulesService } from "../../../services/schedules";
import { generateMovementNotificationEmail } from "../../../services/email-templates/notificacion-movimiento";
import { generateEgresoProviderCreatedEmail } from "../../../services/email-templates/proveedor-egreso-creado";
import {
  MovimientosFondosService,
  MovementAccountKey,
  MovementCurrencyKey,
  MovementStorage,
  MovementStorageState,
} from "../../../services/movimientos-fondos";
import {
  DailyClosingsService,
  DailyClosingRecord,
  DailyClosingsDocument,
} from "../../../services/daily-closings";
import { buildDailyClosingEmailTemplate } from "../../../services/email-templates/daily-closing";
import AgregarMovimiento from "./AgregarMovimiento";
import DailyClosingModal, { DailyClosingFormValues } from "./DailyClosingModal";
import { useActorOwnership } from "../../../hooks/useActorOwnership";
import { db } from "@/config/firebase";
import { findBestStringMatch } from "../../../utils/stringSimilarity";
import { dateKeyToISODate, dateToKey, isoDateToDateKey } from "../../../utils/dateKey";
import {
  addDoc,
  collection,
  serverTimestamp,
  type QueryDocumentSnapshot,
  type DocumentData,
  waitForPendingWrites,
} from "firebase/firestore";

// Límite máximo de ediciones permitidas por movimiento
const MAX_AUDIT_EDITS = 5;

// Estos se inicializarán dinámicamente desde la base de datos
export let FONDO_INGRESO_TYPES: readonly string[] = [];
export let FONDO_GASTO_TYPES: readonly string[] = [];
export let FONDO_EGRESO_TYPES: readonly string[] = [];
export let FONDO_TYPE_OPTIONS: readonly string[] = [];

let AUTO_ADJUSTMENT_MOVEMENT_TYPE_EGRESO = "GASTOS VARIOS";
let AUTO_ADJUSTMENT_MOVEMENT_TYPE_INGRESO = "OTROS INGRESOS";

export type FondoMovementType = string;

const AUTO_ADJUSTMENT_PROVIDER_CODE = "CIERRE DE FONDO GENERAL";
const AUTO_ADJUSTMENT_PROVIDER_CODE_LEGACY = "AJUSTE FONDO GENERAL"; // Para compatibilidad con datos antiguos
const AUTO_ADJUSTMENT_MANAGER = "SISTEMA";

const CIERRE_FONDO_VENTAS_PROVIDER_NAME = "CIERRE FONDO VENTAS";

// Helper para verificar si un proveedor es un cierre/ajuste automático
const isAutoAdjustmentProvider = (code: unknown): boolean =>
  typeof code === "string" &&
  (code === AUTO_ADJUSTMENT_PROVIDER_CODE ||
    code === AUTO_ADJUSTMENT_PROVIDER_CODE_LEGACY);

export const isFondoMovementType = (
  value: string
): value is FondoMovementType =>
  FONDO_TYPE_OPTIONS.includes(value as FondoMovementType);

export const isIngresoType = (type: FondoMovementType) =>
  FONDO_INGRESO_TYPES.includes(type);
export const isGastoType = (type: FondoMovementType) =>
  FONDO_GASTO_TYPES.includes(type);
export const isEgresoType = (type: FondoMovementType) =>
  FONDO_EGRESO_TYPES.includes(type);

// Formatea en Titulo Caso cada palabra
export const formatMovementType = (type: FondoMovementType | string) => {
  if (type === "INFORMATIVO") return "";

  return type
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
};

// Normaliza valores historicos guardados en localStorage a las nuevas categorias
const normalizeStoredType = (value: unknown): FondoMovementType => {
  if (typeof value === "string") {
    const upper = value.toUpperCase().trim();
    if (isFondoMovementType(upper)) return upper;
    // Compatibilidad con valores antiguos
    if (upper === "INGRESO") return "VENTAS";
    if (upper === "EGRESO") return "COMPRA INVENTARIO";
    if (upper === "COMPRA") return "COMPRA INVENTARIO";
    if (upper === "MANTENIMIENTO") return "MANTENIMIENTO INSTALACIONES";
    if (upper === "REPARACION EQUIPO") return "MANTENIMIENTO INSTALACIONES";
    if (upper === "SALARIO" || upper === "SALARIOS") return "SALARIOS";
    if (upper === "GASTO") return "GASTOS VARIOS";
  }
  return "COMPRA INVENTARIO";
};

export type FondoEntry = {
  id: string;
  providerCode: string;
  invoiceNumber: string;
  paymentType: FondoMovementType;
  amountEgreso: number;
  amountIngreso: number;
  manager: string;
  notes: string;
  createdAt: string;
  accountId?: MovementAccountKey;
  currency?: "CRC" | "USD";
  breakdown?: Record<number, number>;
  // audit fields: when an edit is recorded, we create an audit movement
  isAudit?: boolean;
  originalEntryId?: string;
  auditDetails?: string;
};

/**
 * Simplifica un registro de auditoría guardando solo los campos que cambiaron.
 * @param before Estado anterior del movimiento
 * @param after Estado nuevo del movimiento
 * @returns Objeto con solo los campos modificados
 */
const getChangedFields = (
  before: any,
  after: any
): { before: Record<string, any>; after: Record<string, any> } => {
  const changed: { before: Record<string, any>; after: Record<string, any> } = {
    before: {},
    after: {},
  };

  // Campos relevantes a comparar
  const fieldsToCheck = [
    "providerCode",
    "invoiceNumber",
    "paymentType",
    "amountEgreso",
    "amountIngreso",
    "manager",
    "notes",
    "currency",
  ];

  fieldsToCheck.forEach((field) => {
    const beforeVal = before[field];
    const afterVal = after[field];

    // Solo guardar si el campo realmente cambió
    if (beforeVal !== afterVal) {
      changed.before[field] = beforeVal;
      changed.after[field] = afterVal;
    }
  });

  return changed;
};

/**
 * Comprime el historial de auditoría para evitar que auditDetails crezca demasiado.
 * Mantiene máximo 5 registros: el primero (creación), el último (más reciente) y 3 intermedios espaciados.
 * @param history Array completo del historial de auditoría
 * @returns Array comprimido del historial
 */
const compressAuditHistory = (history: any[]): any[] => {
  if (!Array.isArray(history) || history.length <= 5) {
    return history;
  }

  const compressed: any[] = [];
  const first = history[0];
  const last = history[history.length - 1];

  // Siempre mantener el primero
  compressed.push(first);

  // Si hay más de 5 registros, seleccionar 3 intermedios espaciados uniformemente
  if (history.length > 5) {
    const middleCount = 3;
    const step = Math.floor((history.length - 2) / (middleCount + 1));

    for (let i = 1; i <= middleCount; i++) {
      const index = step * i;
      if (index < history.length - 1 && index > 0) {
        compressed.push(history[index]);
      }
    }
  } else {
    // Si hay entre 2 y 5, mantener todos los intermedios
    for (let i = 1; i < history.length - 1; i++) {
      compressed.push(history[i]);
    }
  }

  // Siempre mantener el último
  if (history.length > 1) {
    compressed.push(last);
  }

  return compressed;
};

const FONDO_KEY_SUFFIX = "_fondos_v1";
const buildStorageKey = (namespace: string, suffix: string) =>
  `${namespace}${suffix}`;

const DAILY_CLOSINGS_STORAGE_PREFIX = "fg_daily_closings";

const buildDailyClosingStorageKey = (
  company: string,
  account: MovementAccountKey
) => {
  const normalizedCompany = company.trim().toLowerCase();
  return `${DAILY_CLOSINGS_STORAGE_PREFIX}_${normalizedCompany || "default"
    }_${account}`;
};

const sanitizeMoneyNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.trunc(parsed);
};

const sanitizeBreakdown = (input: unknown): Record<number, number> => {
  if (!input || typeof input !== "object") return {};
  return Object.entries(input as Record<string, unknown>).reduce<
    Record<number, number>
  >((acc, [key, rawValue]) => {
    const denom = Number(key);
    if (!Number.isFinite(denom)) return acc;
    const count = sanitizeMoneyNumber(rawValue);
    if (count > 0) acc[Math.trunc(denom)] = count;
    return acc;
  }, {});
};

type AdjustmentResolutionRemoval = NonNullable<
  NonNullable<DailyClosingRecord["adjustmentResolution"]>["removedAdjustments"]
>[number];

const sanitizeAdjustmentResolution = (
  input: unknown
): DailyClosingRecord["adjustmentResolution"] | undefined => {
  if (!input || typeof input !== "object") return undefined;
  const candidate = input as Record<string, unknown>;
  const resolution: DailyClosingRecord["adjustmentResolution"] = {};

  if (Array.isArray(candidate.removedAdjustments)) {
    const removed = (candidate.removedAdjustments as unknown[])
      .map((item): AdjustmentResolutionRemoval | undefined => {
        if (!item || typeof item !== "object") return undefined;
        const raw = item as Record<string, unknown>;
        const cleaned: Partial<AdjustmentResolutionRemoval> = {};
        if (typeof raw.id === "string" && raw.id.trim().length > 0)
          cleaned.id = raw.id.trim();
        if (raw.currency === "USD") cleaned.currency = "USD";
        else if (raw.currency === "CRC") cleaned.currency = "CRC";
        if (raw.amount !== undefined)
          cleaned.amount = sanitizeMoneyNumber(raw.amount);
        if (raw.amountIngreso !== undefined)
          cleaned.amountIngreso = sanitizeMoneyNumber(raw.amountIngreso);
        if (raw.amountEgreso !== undefined)
          cleaned.amountEgreso = sanitizeMoneyNumber(raw.amountEgreso);
        if (typeof raw.manager === "string" && raw.manager.trim().length > 0)
          cleaned.manager = raw.manager.trim();
        if (
          typeof raw.createdAt === "string" &&
          raw.createdAt.trim().length > 0
        )
          cleaned.createdAt = raw.createdAt.trim();
        return Object.keys(cleaned).length > 0
          ? (cleaned as AdjustmentResolutionRemoval)
          : undefined;
      })
      .filter((item): item is AdjustmentResolutionRemoval => Boolean(item));
    if (removed.length > 0) {
      resolution.removedAdjustments = removed;
    }
  }

  if (typeof candidate.note === "string") {
    const trimmed = candidate.note.trim();
    if (trimmed.length > 0) {
      resolution.note = trimmed;
    }
  }

  if (candidate.postAdjustmentBalanceCRC !== undefined) {
    resolution.postAdjustmentBalanceCRC = sanitizeMoneyNumber(
      candidate.postAdjustmentBalanceCRC
    );
  }

  if (candidate.postAdjustmentBalanceUSD !== undefined) {
    resolution.postAdjustmentBalanceUSD = sanitizeMoneyNumber(
      candidate.postAdjustmentBalanceUSD
    );
  }

  return Object.keys(resolution).length > 0 ? resolution : undefined;
};

const sanitizeDailyClosings = (raw: unknown): DailyClosingRecord[] => {
  if (!Array.isArray(raw)) return [];
  const sanitized = raw.reduce<DailyClosingRecord[]>((acc, candidate) => {
    if (!candidate || typeof candidate !== "object") return acc;
    const record = candidate as Partial<DailyClosingRecord>;
    const id =
      typeof record.id === "string" && record.id.trim().length > 0
        ? record.id
        : `${Date.now()}_${acc.length}`;
    const manager = typeof record.manager === "string" ? record.manager : "";
    const closingDate =
      typeof record.closingDate === "string"
        ? record.closingDate
        : new Date().toISOString();
    const createdAt =
      typeof record.createdAt === "string" ? record.createdAt : closingDate;
    const adjustmentResolution = sanitizeAdjustmentResolution(
      record.adjustmentResolution
    );
    acc.push({
      id,
      createdAt,
      closingDate,
      manager,
      totalCRC: sanitizeMoneyNumber(record.totalCRC),
      totalUSD: sanitizeMoneyNumber(record.totalUSD),
      recordedBalanceCRC: sanitizeMoneyNumber(record.recordedBalanceCRC),
      recordedBalanceUSD: sanitizeMoneyNumber(record.recordedBalanceUSD),
      diffCRC: sanitizeMoneyNumber(record.diffCRC),
      diffUSD: sanitizeMoneyNumber(record.diffUSD),
      notes: typeof record.notes === "string" ? record.notes : "",
      breakdownCRC: sanitizeBreakdown(record.breakdownCRC),
      breakdownUSD: sanitizeBreakdown(record.breakdownUSD),
      ...(adjustmentResolution ? { adjustmentResolution } : {}),
    });
    return acc;
  }, []);
  return sanitized.slice(0, DailyClosingsService.MAX_RECORDS);
};

const dailyClosingSortValue = (record: DailyClosingRecord): number => {
  const createdAtTimestamp = Date.parse(record.createdAt);
  if (!Number.isNaN(createdAtTimestamp)) return createdAtTimestamp;
  const closingAtTimestamp = Date.parse(record.closingDate);
  if (!Number.isNaN(closingAtTimestamp)) return closingAtTimestamp;
  return 0;
};

const mergeDailyClosingRecords = (
  existing: DailyClosingRecord[],
  incoming: DailyClosingRecord[]
): DailyClosingRecord[] => {
  if (
    incoming.length === 0 &&
    existing.length <= DailyClosingsService.MAX_RECORDS
  ) {
    return existing;
  }
  const map = new Map<string, DailyClosingRecord>();
  existing.forEach((record) => map.set(record.id, record));
  incoming.forEach((record) => map.set(record.id, record));
  const sorted = Array.from(map.values()).sort(
    (a, b) => dailyClosingSortValue(b) - dailyClosingSortValue(a)
  );
  return sorted.slice(0, DailyClosingsService.MAX_RECORDS);
};

const flattenDailyClosingsDocument = (
  document: DailyClosingsDocument
): { records: DailyClosingRecord[]; loadedKeys: Set<string> } => {
  const loadedKeys = new Set<string>();
  const aggregated: DailyClosingRecord[] = [];
  Object.entries(document.closingsByDate).forEach(([dateKey, list]) => {
    if (!Array.isArray(list) || list.length === 0) return;
    loadedKeys.add(dateKey);
    list.forEach((record) => {
      aggregated.push(record);
    });
  });
  aggregated.sort(
    (a, b) => dailyClosingSortValue(b) - dailyClosingSortValue(a)
  );
  return {
    records: aggregated.slice(0, DailyClosingsService.MAX_RECORDS),
    loadedKeys,
  };
};

const NAMESPACE_PERMISSIONS: Record<string, keyof UserPermissions> = {
  fg: "fondogeneral",
  bcr: "fondogeneralBCR",
  bn: "fondogeneralBN",
  bac: "fondogeneralBAC",
};

const NAMESPACE_DESCRIPTIONS: Record<string, string> = {
  fg: "el Fondo General",
  bcr: "la cuenta BCR",
  bn: "la cuenta BN",
  bac: "la cuenta BAC",
};

const ACCOUNT_KEY_BY_NAMESPACE: Record<string, MovementAccountKey> = {
  fg: "FondoGeneral",
  bcr: "BCR",
  bn: "BN",
  bac: "BAC",
};

const MOVEMENT_ACCOUNT_KEYS: MovementAccountKey[] = [
  "FondoGeneral",
  "BCR",
  "BN",
  "BAC",
];

const isMovementAccountKey = (value: unknown): value is MovementAccountKey =>
  typeof value === "string" &&
  MOVEMENT_ACCOUNT_KEYS.includes(value as MovementAccountKey);

const getAccountKeyFromNamespace = (namespace: string): MovementAccountKey =>
  ACCOUNT_KEY_BY_NAMESPACE[namespace] || "FondoGeneral";

const coerceIdentifier = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return undefined;
};

const coerceInvoice = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value))
    return String(Math.trunc(value));
  return "";
};

const coerceNotes = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return "";
};

const resolveCreatedAt = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value === "object") {
    const maybeTimestamp = value as { toDate?: () => Date };
    if (typeof maybeTimestamp?.toDate === "function") {
      try {
        const date = maybeTimestamp.toDate();
        return date instanceof Date && !Number.isNaN(date.getTime())
          ? date.toISOString()
          : undefined;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
};

const dateKeyFromDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

export const sanitizeFondoEntries = (
  rawEntries: unknown,
  forcedCurrency?: MovementCurrencyKey,
  forcedAccount?: MovementAccountKey
): FondoEntry[] => {
  if (!Array.isArray(rawEntries)) return [];

  return rawEntries.reduce<FondoEntry[]>((acc, raw) => {
    const entry = raw as Partial<FondoEntry>;

    const id = coerceIdentifier(entry.id);
    const providerCode = coerceIdentifier(entry.providerCode);
    const invoiceNumber = coerceInvoice(entry.invoiceNumber);
    const paymentType = normalizeStoredType(entry.paymentType);
    const manager = coerceIdentifier(entry.manager);
    const createdAt = resolveCreatedAt(entry.createdAt);

    if (!id || !providerCode || !manager || !createdAt) return acc;

    const rawEgreso =
      typeof entry.amountEgreso === "number"
        ? entry.amountEgreso
        : Number(entry.amountEgreso) || 0;
    const rawIngreso =
      typeof entry.amountIngreso === "number"
        ? entry.amountIngreso
        : Number(entry.amountIngreso) || 0;

    const amountEgreso = Math.trunc(rawEgreso);
    const amountIngreso = Math.trunc(rawIngreso);

    const currency: MovementCurrencyKey =
      forcedCurrency ?? (entry.currency === "USD" ? "USD" : "CRC");
    const accountId =
      forcedAccount ??
      (isMovementAccountKey(entry.accountId) ? entry.accountId : undefined);

    // Si los tipos aún no están cargados (arrays vacíos), preservar los montos originales
    const typesLoaded =
      FONDO_INGRESO_TYPES.length > 0 ||
      FONDO_GASTO_TYPES.length > 0 ||
      FONDO_EGRESO_TYPES.length > 0;

    acc.push({
      id,
      providerCode,
      invoiceNumber,
      paymentType,
      currency,
      accountId,
      // Si los tipos no están cargados, preservar los montos originales
      amountEgreso: typesLoaded
        ? isEgresoType(paymentType) || isGastoType(paymentType)
          ? amountEgreso
          : 0
        : amountEgreso,
      amountIngreso: typesLoaded
        ? isIngresoType(paymentType)
          ? amountIngreso
          : 0
        : amountIngreso,
      manager,
      notes: coerceNotes(entry.notes),
      createdAt,
      isAudit: !!entry.isAudit,
      originalEntryId:
        typeof entry.originalEntryId === "string"
          ? entry.originalEntryId
          : undefined,
      auditDetails:
        typeof entry.auditDetails === "string" ? entry.auditDetails : undefined,
    });

    return acc;
  }, []);
};

const AccessRestrictedMessage = ({ description }: { description: string }) => (
  <div className="flex flex-col items-center justify-center p-8 bg-[var(--card-bg)] rounded-lg border border-[var(--input-border)] text-center">
    <Lock className="w-10 h-10 text-[var(--muted-foreground)] mb-4" />
    <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
      Acceso restringido
    </h3>
    <p className="text-[var(--muted-foreground)]">{description}</p>
    <p className="text-sm text-[var(--muted-foreground)] mt-2">
      Contacta a un administrador para obtener acceso.
    </p>
  </div>
);

// Clave compartida para sincronizar la selección de empresa entre ProviderSection y FondoSection
const SHARED_COMPANY_STORAGE_KEY = "fg_selected_company_shared";

export function ProviderSection({ id }: { id?: string }) {
  const { user, loading: authLoading } = useAuth();
  const assignedCompany = user?.ownercompanie?.trim() ?? "";
  const { ownerIds: actorOwnerIds } = useActorOwnership(user);
  const allowedOwnerIds = useMemo(() => {
    const set = new Set<string>();
    actorOwnerIds.forEach((id) => {
      const normalized =
        typeof id === "string" ? id.trim() : String(id || "").trim();
      if (normalized) set.add(normalized);
    });
    if (user?.ownerId) {
      const normalized = String(user.ownerId).trim();
      if (normalized) set.add(normalized);
    }
    return set;
  }, [actorOwnerIds, user?.ownerId]);
  const isAdminUser = user?.role === "admin";
  const isSuperAdminUser = user?.role === "superadmin";
  const canSelectCompany = isAdminUser || isSuperAdminUser;
  const [adminCompany, setAdminCompany] = useState(() => {
    if (typeof window === "undefined") return assignedCompany;
    try {
      const stored = localStorage.getItem(SHARED_COMPANY_STORAGE_KEY);
      return stored || assignedCompany;
    } catch {
      return assignedCompany;
    }
  });
  const company = canSelectCompany ? adminCompany : assignedCompany;
  const {
    providers,
    loading: providersLoading,
    error,
    addProvider,
    removeProvider,
    updateProvider,
  } = useProviders(company);
  const permissions =
    user?.permissions || getDefaultPermissions(user?.role || "user");
  const canManageFondoGeneral = Boolean(permissions.fondogeneral);
  const [ownerCompanies, setOwnerCompanies] = useState<Empresas[]>([]);
  const [ownerCompaniesLoading, setOwnerCompaniesLoading] = useState(false);
  const [ownerCompaniesError, setOwnerCompaniesError] = useState<string | null>(
    null
  );

  const sortedOwnerCompanies = useMemo(() => {
    return ownerCompanies.slice().sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", "es", {
        sensitivity: "base",
      })
    );
  }, [ownerCompanies]);

  useEffect(() => {
    const normalizeCompanyKey = (value: unknown) =>
      String(value || "")
        .trim()
        .toLowerCase();
    const getEmpresaCompanyKey = (emp: Empresas) =>
      String(emp?.name || emp?.ubicacion || emp?.id || "").trim();

    if (!canSelectCompany) {
      setOwnerCompanies([]);
      setOwnerCompaniesLoading(false);
      setOwnerCompaniesError(null);
      return;
    }
    if (isAdminUser && allowedOwnerIds.size === 0) {
      setOwnerCompanies([]);
      setOwnerCompaniesLoading(false);
      setOwnerCompaniesError(
        "No se pudo determinar el ownerId asociado a tu cuenta."
      );
      return;
    }

    let isMounted = true;
    setOwnerCompaniesLoading(true);
    setOwnerCompaniesError(null);

    EmpresasService.getAllEmpresas()
      .then((empresas) => {
        if (!isMounted) return;
        const filtered = isAdminUser
          ? empresas.filter((emp) => {
            const owner = (emp.ownerId || "").trim();
            if (!owner) return false;
            return allowedOwnerIds.has(owner);
          })
          : empresas;
        setOwnerCompanies(filtered);
        setAdminCompany((current) => {
          const normalizedCurrent = normalizeCompanyKey(current);
          if (normalizedCurrent.length > 0) {
            const exists = filtered.some((emp) => {
              const candidates = [emp.name, emp.ubicacion, emp.id]
                .map(normalizeCompanyKey)
                .filter(Boolean);
              return candidates.includes(normalizedCurrent);
            });
            if (exists) return current;
          }
          const fallback = filtered[0];
          return fallback ? getEmpresaCompanyKey(fallback) : "";
        });
      })
      .catch((err) => {
        if (!isMounted) return;
        setOwnerCompanies([]);
        setOwnerCompaniesError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar las empresas disponibles."
        );
      })
      .finally(() => {
        if (isMounted) setOwnerCompaniesLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [allowedOwnerIds, canSelectCompany, isAdminUser]);

  const [providerName, setProviderName] = useState("");
  const [providerType, setProviderType] = useState<FondoMovementType | "">("");
  const [editingProviderCode, setEditingProviderCode] = useState<string | null>(
    null
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [providerTypeError, setProviderTypeError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [providerDrawerOpen, setProviderDrawerOpen] = useState(false);
  const [addNotification, setAddNotification] = useState(false);
  const [selectedAdminId, setSelectedAdminId] = useState<string>("");
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  type ProviderVisitDay = "D" | "L" | "M" | "MI" | "J" | "V" | "S";
  type ProviderVisitFrequency = "SEMANAL" | "QUINCENAL" | "MENSUAL" | "22 DIAS";
  type ProviderVisitConfig = {
    createOrderDays: ProviderVisitDay[];
    receiveOrderDays: ProviderVisitDay[];
    frequency: ProviderVisitFrequency;
    startDateKey?: number;
  };

  const VISIT_DAY_ORDER = useMemo<ProviderVisitDay[]>(
    () => ["D", "L", "M", "MI", "J", "V", "S"],
    []
  );
  const VISIT_DAY_TITLES = useMemo<Record<ProviderVisitDay, string>>(
    () => ({
      D: "Domingo",
      L: "Lunes",
      M: "Martes",
      MI: "Miércoles",
      J: "Jueves",
      V: "Viernes",
      S: "Sábado",
    }),
    []
  );
  const VISIT_FREQUENCY_OPTIONS = useMemo<
    Array<{ value: ProviderVisitFrequency; label: string }>
  >(
    () => [
      { value: "SEMANAL", label: "Semanal" },
      { value: "QUINCENAL", label: "Quincenal" },
      { value: "22 DIAS", label: "22 días" },
      { value: "MENSUAL", label: "Mensual" },
    ],
    []
  );

  const [addVisit, setAddVisit] = useState(false);
  const [visitCreateDays, setVisitCreateDays] = useState<ProviderVisitDay[]>([]);
  const [visitReceiveDays, setVisitReceiveDays] = useState<ProviderVisitDay[]>([]);
  const [visitFrequency, setVisitFrequency] = useState<ProviderVisitFrequency | "">("");
  const [visitStartDateISO, setVisitStartDateISO] = useState<string>("");

  const isCompraInventarioProvider =
    typeof providerType === "string" &&
    providerType.trim().toUpperCase() === "COMPRA INVENTARIO";

  const sortVisitDays = useCallback(
    (days: ProviderVisitDay[]) => {
      return [...days].sort(
        (a, b) => VISIT_DAY_ORDER.indexOf(a) - VISIT_DAY_ORDER.indexOf(b)
      );
    },
    [VISIT_DAY_ORDER]
  );

  const toggleVisitDay = useCallback(
    (
      day: ProviderVisitDay,
      setter: React.Dispatch<React.SetStateAction<ProviderVisitDay[]>>
    ) => {
      setter((prev) => {
        const exists = prev.includes(day);
        const next = exists ? prev.filter((d) => d !== day) : [...prev, day];
        return sortVisitDays(next);
      });
    },
    [sortVisitDays]
  );

  useEffect(() => {
    if (!isCompraInventarioProvider) {
      setAddVisit(false);
      setVisitCreateDays([]);
      setVisitReceiveDays([]);
      setVisitFrequency("");
      setVisitStartDateISO("");
    }
  }, [isCompraInventarioProvider]);

  useEffect(() => {
    // Si no es semanal, permitir configurar fecha inicial.
    // Para semanal, limpiar la fecha inicial.
    if (!addVisit) return;
    if (!visitFrequency) {
      setVisitStartDateISO("");
      return;
    }
    if (visitFrequency === "SEMANAL") {
      if (visitStartDateISO) setVisitStartDateISO("");
      return;
    }
    // Si se selecciona frecuencia no semanal y aún no hay fecha, sugerir hoy.
    if (!visitStartDateISO) {
      setVisitStartDateISO(dateKeyToISODate(dateToKey(new Date())));
    }
  }, [addVisit, visitFrequency, visitStartDateISO]);

  // Estado para tipos de movimientos dinámicos
  const [fondoTypesLoaded, setFondoTypesLoaded] = useState(false);
  const [ingresoTypes, setIngresoTypes] = useState<string[]>([]);
  const [gastoTypes, setGastoTypes] = useState<string[]>([]);
  const [egresoTypes, setEgresoTypes] = useState<string[]>([]);

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    code: string;
    name: string;
  }>({
    open: false,
    code: "",
    name: "",
  });

  const pendingProviderSaveRef = useRef<null | {
    mode: "create" | "update";
    code?: string;
    name: string;
    providerType?: FondoMovementType;
    correonotifi?: string;
    visit?: ProviderVisitConfig;
  }>(null);

  // Cache para evitar consultas repetidas (se mantiene en memoria por sesión)
  const schedulesMonthCacheRef = useRef<
    Map<
      string,
      {
        at: number;
        promise: Promise<Awaited<ReturnType<typeof SchedulesService.getSchedulesByLocationYearMonth>>>;
      }
    >
  >(new Map());
  const ownerAdminEmailCacheRef = useRef<
    Map<string, { at: number; promise: Promise<string> }>
  >(new Map());

  const SCHEDULES_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
  const OWNER_ADMIN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

  const getMonthlySchedulesCached = useCallback(
    async (locationValue: string, year: number, month0: number) => {
      const key = `${locationValue}__${year}__${month0}`;
      const now = Date.now();
      const cached = schedulesMonthCacheRef.current.get(key);
      if (cached && now - cached.at < SCHEDULES_CACHE_TTL_MS) {
        return cached.promise;
      }
      const promise = SchedulesService.getSchedulesByLocationYearMonth(
        locationValue,
        year,
        month0
      );
      schedulesMonthCacheRef.current.set(key, { at: now, promise });
      return promise;
    },
    []
  );

  const getOwnerPrimaryAdminEmailCached = useCallback(
    async (ownerId: string): Promise<string> => {
      const normalized = (ownerId || "").trim();
      if (!normalized) return "";
      const now = Date.now();
      const cached = ownerAdminEmailCacheRef.current.get(normalized);
      if (cached && now - cached.at < OWNER_ADMIN_CACHE_TTL_MS) {
        return cached.promise;
      }
      const promise = (async () => {
        const admin = await UsersService.getPrimaryAdminByOwner(normalized);
        return typeof admin?.email === "string" ? admin.email.trim() : "";
      })();
      ownerAdminEmailCacheRef.current.set(normalized, { at: now, promise });
      return promise;
    },
    []
  );
  const [similarConfirmOpen, setSimilarConfirmOpen] = useState(false);
  const [similarConfirmMessage, setSimilarConfirmMessage] =
    useState<React.ReactNode>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | "all">(10);
  const [showOnlyWithEmail, setShowOnlyWithEmail] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("provider-filter-email");
    return saved === "true";
  });
  const companySelectId = `provider-company-select-${id ?? "default"}`;
  const showCompanySelector =
    canSelectCompany &&
    (ownerCompaniesLoading ||
      sortedOwnerCompanies.length > 0 ||
      !!ownerCompaniesError);

  const filteredProviders = useMemo(() => {
    return providers.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesEmail =
        !showOnlyWithEmail ||
        (p.correonotifi && p.correonotifi.trim().length > 0);
      return matchesSearch && matchesEmail;
    });
  }, [providers, searchTerm, showOnlyWithEmail]);

  const totalPages = useMemo(() => {
    if (itemsPerPage === "all") return 1;
    return Math.ceil(filteredProviders.length / itemsPerPage);
  }, [filteredProviders.length, itemsPerPage]);

  const paginatedProviders = useMemo(() => {
    if (itemsPerPage === "all") return filteredProviders;
    return filteredProviders.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [filteredProviders, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, itemsPerPage]);

  // Guardar preferencia de filtro de correo en localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "provider-filter-email",
        showOnlyWithEmail.toString()
      );
    }
  }, [showOnlyWithEmail]);

  // Escuchar cambios de empresa desde FondoSection (sincronización bidireccional)
  useEffect(() => {
    if (!canSelectCompany) return;

    const handleStorageChange = (event: StorageEvent) => {
      if (
        event.key === SHARED_COMPANY_STORAGE_KEY &&
        event.newValue &&
        event.newValue !== adminCompany
      ) {
        setAdminCompany(event.newValue);
        // Reset form state when company changes from external source
        setProviderDrawerOpen(false);
        setFormError(null);
        setProviderName("");
        setProviderType("");
        setEditingProviderCode(null);
        setDeletingCode(null);
        setConfirmState({ open: false, code: "", name: "" });
        setCurrentPage(1);
        setSearchTerm("");
        setItemsPerPage(10);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [canSelectCompany, adminCompany]);

  const notificationOwnerId = useMemo(() => {
    const normalizeCompanyKey = (value: unknown) =>
      String(value || "")
        .trim()
        .toLowerCase();

    if (!user) return "";

    // Admin/Superadmin: ownerId de la empresa seleccionada
    if (canSelectCompany) {
      const normalizedSelected = normalizeCompanyKey(adminCompany);
      if (!normalizedSelected) return "";
      const match = ownerCompanies.find((emp) => {
        const candidates = [emp?.name, emp?.ubicacion, emp?.id]
          .map(normalizeCompanyKey)
          .filter(Boolean);
        return candidates.includes(normalizedSelected);
      });
      return typeof match?.ownerId === "string" ? match.ownerId.trim() : "";
    }

    // Otros: si tiene ownerId usarlo, si no (dueño) usar su propio id
    if (user.ownerId && user.ownerId.trim().length > 0) return user.ownerId.trim();
    return (user.id || "").trim();
  }, [adminCompany, canSelectCompany, ownerCompanies, user]);

  const sendEgresoProviderCreatedEmailToOwner = useCallback(
    async (providerName: string, providerType?: FondoMovementType): Promise<void> => {
      try {
        if (!providerType) return;
        if (!isEgresoType(providerType)) return;

        const resolveCreatedByFromControlHorario = async (createdAtISO: string): Promise<string> => {
          const fallback =
            (user?.name?.trim() || user?.email?.trim() || user?.id || "Sistema").toString();

          const normalizedCompany = (company || "").trim();
          if (!normalizedCompany) return fallback;

          // En producción, `companieValue` en schedules puede estar guardado como `name`, `ubicacion` o `id`
          // según cómo se haya seleccionado la empresa al registrar el horario.
          // Si podemos, intentamos con varias claves para evitar mismatch.
          const companyKeysToTry = (() => {
            const set = new Set<string>();
            set.add(normalizedCompany);

            if (canSelectCompany && ownerCompanies.length > 0) {
              const normalizeCompanyKey = (value: unknown) =>
                String(value || "")
                  .trim()
                  .toLowerCase();

              const selectedKey = normalizeCompanyKey(adminCompany);
              const match = ownerCompanies.find((emp) => {
                const candidates = [emp?.name, emp?.ubicacion, emp?.id]
                  .map(normalizeCompanyKey)
                  .filter(Boolean);
                return candidates.includes(selectedKey);
              });

              [match?.name, match?.ubicacion, match?.id]
                .map((v) => (typeof v === "string" ? v.trim() : String(v || "").trim()))
                .filter(Boolean)
                .forEach((v) => set.add(v));
            }

            return Array.from(set);
          })();

          const createdDate = new Date(createdAtISO);
          if (Number.isNaN(createdDate.getTime())) return fallback;
          const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Costa_Rica",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).formatToParts(createdDate);

          const getPart = (type: string) =>
            parts.find((p) => p.type === type)?.value ?? "";

          const year = Number(getPart("year"));
          const month1 = Number(getPart("month"));
          const day = Number(getPart("day"));
          const hour = Number(getPart("hour"));

          if (!Number.isFinite(year) || !Number.isFinite(month1) || !Number.isFinite(day) || !Number.isFinite(hour)) {
            return fallback;
          }

          // Regla: cambio de turno a las 4pm (16:00) Costa Rica.
          // Antes de las 4pm => turno "D". Desde las 4pm => turno "N".
          const shift = hour >= 16 ? "N" : "D";

          // En schedules se usa month en formato JS (0-11)
          const month0 = Math.max(0, Math.min(11, month1 - 1));

          try {
            const schedulesLists = await Promise.all(
              companyKeysToTry.map((key) =>
                getMonthlySchedulesCached(key, year, month0)
              )
            );
            const monthSchedules = schedulesLists.flat();

            const matches = monthSchedules
              .filter((entry) => entry.day === day && entry.shift === shift)
              .map((entry) => (entry.employeeName || "").trim())
              .filter(Boolean);

            if (matches.length === 0) return fallback;

            const normalizedUserName = (user?.name || "").trim().toLowerCase();
            const direct = normalizedUserName
              ? matches.find((name) => name.toLowerCase() === normalizedUserName)
              : undefined;
            if (direct) return direct;

            return matches
              .slice()
              .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
              [0];
          } catch (err) {
            console.error("[PROVIDER-EGRESO-EMAIL] Error resolving createdBy from schedules:", err);
            return fallback;
          }
        };

        const ownerId = (notificationOwnerId || "").trim();
        if (!ownerId) return;

        const toEmail = await getOwnerPrimaryAdminEmailCached(ownerId);
        if (!toEmail) return;

        const createdAt = new Date().toISOString();
        const createdBy = await resolveCreatedByFromControlHorario(createdAt);

        const emailContent = generateEgresoProviderCreatedEmail({
          company: company || "",
          providerName,
          providerType,
          createdBy,
          createdAt,
        });

        await addDoc(collection(db, "mail"), {
          to: toEmail,
          subject: emailContent.subject,
          text: emailContent.text,
          html: emailContent.html,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.error("[PROVIDER-EGRESO-EMAIL] Error sending owner notification:", err);
        // La notificación es secundaria: no bloquear creación del proveedor
      }
    },
    [adminCompany, canSelectCompany, company, getMonthlySchedulesCached, getOwnerPrimaryAdminEmailCached, notificationOwnerId, ownerCompanies, user]
  );

  // Cargar admins cuando se necesite para notificaciones
  useEffect(() => {
    if (!addNotification || !user) {
      setAdminUsers([]);
      return;
    }

    let isMounted = true;
    setLoadingAdmins(true);

    const referenceOwnerId = notificationOwnerId;
    if (!referenceOwnerId) {
      setAdminUsers([]);
      setLoadingAdmins(false);
      return;
    }

    UsersService.findUsersByRole("admin")
      .then((allAdmins) => {
        if (!isMounted) return;

        // Filtrar admins que cumplan cualquiera de estas condiciones:
        // 1. Admins que tengan el mismo ownerId que el referenceOwnerId
        // 2. El admin "dueño" cuyo id sea igual al referenceOwnerId (sin ownerId o ownerId vacío)
        const filtered = allAdmins.filter((admin) => {
          const hasEmail = admin.email && admin.email.trim().length > 0;
          if (!hasEmail) return false;

          // Condición 1: Admin con el mismo ownerId
          const sameOwnerId =
            admin.ownerId && admin.ownerId.trim() === referenceOwnerId;

          // Condición 2: Admin dueño (su id es el referenceOwnerId y no tiene ownerId)
          const isOwnerAdmin =
            admin.id === referenceOwnerId &&
            (!admin.ownerId || admin.ownerId.trim().length === 0);

          return sameOwnerId || isOwnerAdmin;
        });

        setAdminUsers(filtered);
        setSelectedAdminId((prev) => prev || filtered[0]?.id || "");
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Error loading admin users:", err);
        setAdminUsers([]);
      })
      .finally(() => {
        if (isMounted) setLoadingAdmins(false);
      });

    return () => {
      isMounted = false;
    };
  }, [addNotification, notificationOwnerId, user]);

  // Cargar tipos de movimientos de fondo desde la base de datos (con caché y sincronización en tiempo real)
  useEffect(() => {
    let isMounted = true;

    // Función para cargar y actualizar tipos
    const loadTypes = async () => {
      try {
        const types =
          await FondoMovementTypesService.getMovementTypesByCategoriesWithCache();

        if (!isMounted) return;

        setIngresoTypes(types.INGRESO);
        setGastoTypes(types.GASTO);
        setEgresoTypes(types.EGRESO);
        setFondoTypesLoaded(true);

        // Actualizar las variables globales para compatibilidad
        FONDO_INGRESO_TYPES = types.INGRESO;
        FONDO_GASTO_TYPES = types.GASTO;
        FONDO_EGRESO_TYPES = types.EGRESO;
        FONDO_TYPE_OPTIONS = [
          ...types.INGRESO,
          ...types.GASTO,
          ...types.EGRESO,
        ];

        // Actualizar los tipos de ajuste automático
        AUTO_ADJUSTMENT_MOVEMENT_TYPE_EGRESO =
          types.GASTO.find((t) => t.toUpperCase() === "GASTOS VARIOS") ??
          types.GASTO[types.GASTO.length - 1] ??
          "";
        AUTO_ADJUSTMENT_MOVEMENT_TYPE_INGRESO =
          types.INGRESO.find((t) => t.toUpperCase() === "OTROS INGRESOS") ??
          types.INGRESO[types.INGRESO.length - 1] ??
          "";

        console.log("[FondoTypes] Loaded:", types);
      } catch (err) {
        console.error("Error loading fondo movement types:", err);
        if (isMounted) {
          setFondoTypesLoaded(true);
        }
      }
    };

    // Listener para actualizaciones en tiempo real desde el caché
    const handleFondoTypesUpdate = (_event: Event) => {
      void _event;
      if (!isMounted) return;

      console.log("[FondoTypes] Cache updated, reloading types...");

      // Recargar tipos cuando el caché se actualiza
      loadTypes();
    };

    // Cargar tipos iniciales (desde caché o DB)
    loadTypes();

    // Escuchar actualizaciones en tiempo real
    window.addEventListener(
      "fondoMovementTypesUpdated",
      handleFondoTypesUpdate
    );

    return () => {
      isMounted = false;
      window.removeEventListener(
        "fondoMovementTypesUpdated",
        handleFondoTypesUpdate
      );
    };
  }, []);

  const handleAdminCompanyChange = useCallback(
    (value: string) => {
      if (!canSelectCompany) return;
      setAdminCompany(value);
      try {
        localStorage.setItem(SHARED_COMPANY_STORAGE_KEY, value);
        // Disparar evento de storage manualmente para sincronizar dentro de la misma ventana
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: SHARED_COMPANY_STORAGE_KEY,
            newValue: value,
            oldValue: adminCompany,
            storageArea: localStorage,
          })
        );
      } catch (error) {
        console.error("Error saving selected company to localStorage:", error);
      }
      setProviderDrawerOpen(false);
      setFormError(null);
      setProviderTypeError("");
      setProviderName("");
      setProviderType("");
      setEditingProviderCode(null);
      setDeletingCode(null);
      setAddNotification(false);
      setSelectedAdminId("");
      setConfirmState({ open: false, code: "", name: "" });
      setCurrentPage(1);
      setSearchTerm("");
      setItemsPerPage(10);
    },
    [canSelectCompany, adminCompany]
  );

  // provider creation is handled from the drawer UI below

  const openRemoveModal = (code: string, name: string) => {
    if (!company) return;
    setConfirmState({ open: true, code, name });
  };

  const openEditProvider = (code: string) => {
    const prov = providers.find((p) => p.code === code);
    if (!prov) return;
    setEditingProviderCode(prov.code);
    setProviderName(prov.name ?? "");
    setProviderType((prov.type as FondoMovementType) ?? "");
    setProviderTypeError("");
    // Cargar datos de notificación si existen
    if (prov.correonotifi && prov.correonotifi.trim().length > 0) {
      setAddNotification(true);
      // Intentar encontrar el admin con ese correo
      const matchingAdmin = adminUsers.find(
        (admin) => admin.email === prov.correonotifi
      );
      if (matchingAdmin?.id) {
        setSelectedAdminId(matchingAdmin.id);
      }
    } else {
      setAddNotification(false);
      setSelectedAdminId("");
    }

    if (prov.visit && (prov.type || "").toUpperCase() === "COMPRA INVENTARIO") {
      setAddVisit(true);
      setVisitCreateDays((prov.visit.createOrderDays || []) as ProviderVisitDay[]);
      setVisitReceiveDays((prov.visit.receiveOrderDays || []) as ProviderVisitDay[]);
      setVisitFrequency((prov.visit.frequency || "") as ProviderVisitFrequency);

      const startKey = (prov.visit as any).startDateKey;
      if (typeof startKey === "number" && Number.isFinite(startKey) && startKey > 0) {
        setVisitStartDateISO(dateKeyToISODate(startKey));
      } else {
        setVisitStartDateISO("");
      }
    } else {
      setAddVisit(false);
      setVisitCreateDays([]);
      setVisitReceiveDays([]);
      setVisitFrequency("");
      setVisitStartDateISO("");
    }

    setProviderDrawerOpen(true);
  };

  const cancelRemoveModal = () => {
    if (deletingCode) return;
    setConfirmState({ open: false, code: "", name: "" });
  };

  const closeRemoveModal = () =>
    setConfirmState({ open: false, code: "", name: "" });

  const confirmRemoveProvider = async () => {
    if (!company) return;
    if (!confirmState.code || deletingCode) return;

    try {
      setFormError(null);
      setDeletingCode(confirmState.code);
      await removeProvider(confirmState.code);
      closeRemoveModal();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo eliminar el proveedor.";
      setFormError(message);
      closeRemoveModal();
    } finally {
      setDeletingCode(null);
    }
  };

  const resolvedError = formError || error;
  const isLoading = authLoading || providersLoading;

  if (authLoading) {
    return (
      <div id={id} className="mt-10">
        <div className="p-6 bg-[var(--card-bg)] border border-[var(--input-border)] rounded text-center">
          <p className="text-[var(--muted-foreground)]">Cargando permisos...</p>
        </div>
      </div>
    );
  }

  if (!canManageFondoGeneral) {
    return (
      <div id={id} className="mt-10">
        <AccessRestrictedMessage description="No tienes permisos para administrar proveedores del Fondo General." />
      </div>
    );
  }

  if (!fondoTypesLoaded) {
    return (
      <div id={id} className="mt-10">
        <div className="p-8 bg-[var(--card-bg)] border border-[var(--input-border)] rounded text-center space-y-3">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]"></div>
          </div>
          <p className="text-[var(--muted-foreground)]">
            Cargando tipos de movimientos...
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Esto solo ocurre la primera vez
          </p>
        </div>
      </div>
    );
  }

  return (
    <div id={id} className="mt-3 sm:mt-6 lg:mt-10" style={{ color: "#ffffff" }}>
      <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm sm:text-base font-medium text-[var(--muted-foreground)] flex items-center gap-2">
              <UserPlus className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--muted-foreground)]" />
              Proveedores
            </h2>
            {company && (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--input-border)] bg-[var(--input-bg)] px-2.5 py-1 text-[10px] sm:text-xs">
                <span className="text-[var(--muted-foreground)]">Empresa</span>
                <span className="font-semibold text-[var(--foreground)] truncate max-w-[160px] sm:max-w-none">
                  {company}
                </span>
              </span>
            )}
          </div>
          <p className="mt-1 text-[10px] sm:text-xs text-[var(--muted-foreground)]">
            Administra proveedores del Fondo General.
          </p>
        </div>

        <div className="flex w-full flex-col sm:w-auto sm:flex-row items-stretch sm:items-end gap-2 sm:gap-3">
          {showCompanySelector && (
            <div className="flex w-full sm:w-auto flex-col gap-1">
              <label
                htmlFor={companySelectId}
                className="text-[10px] sm:text-xs text-[var(--muted-foreground)]"
              >
                Empresa
              </label>
              <select
                id={companySelectId}
                value={adminCompany}
                onChange={(event) => handleAdminCompanyChange(event.target.value)}
                disabled={
                  ownerCompaniesLoading || sortedOwnerCompanies.length === 0
                }
                className="w-full sm:min-w-[220px] lg:min-w-[260px] px-3 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-xs sm:text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              >
                {(() => {
                  const getCompanyKey = (emp: Empresas) =>
                    String(emp?.name || emp?.ubicacion || emp?.id || "").trim();
                  const getCompanyLabel = (emp: Empresas) => {
                    const name = String(emp?.name || "").trim();
                    const ubicacion = String(emp?.ubicacion || "").trim();
                    if (
                      name &&
                      ubicacion &&
                      name.toLowerCase() !== ubicacion.toLowerCase()
                    ) {
                      return `${name} (${ubicacion})`;
                    }
                    return name || ubicacion || getCompanyKey(emp) || "Sin nombre";
                  };

                  return (
                    <>
                      {ownerCompaniesLoading && (
                        <option value="">Cargando empresas...</option>
                      )}
                      {!ownerCompaniesLoading &&
                        sortedOwnerCompanies.length === 0 && (
                          <option value="">Sin empresas disponibles</option>
                        )}
                      {!ownerCompaniesLoading &&
                        sortedOwnerCompanies.length > 0 && (
                          <>
                            <option value="" disabled>
                              Selecciona una empresa
                            </option>
                            {sortedOwnerCompanies.map((emp, index) => (
                              <option
                                key={
                                  emp.id ||
                                  emp.name ||
                                  emp.ubicacion ||
                                  `admin-company-${index}`
                                }
                                value={getCompanyKey(emp)}
                              >
                                {getCompanyLabel(emp)}
                              </option>
                            ))}
                          </>
                        )}
                    </>
                  );
                })()}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setProviderDrawerOpen(true);
              setFormError(null);
              setProviderTypeError("");
              setProviderName("");
              setProviderType("");
              setEditingProviderCode(null);
              setAddNotification(false);
              setSelectedAdminId("");

              setAddVisit(false);
              setVisitCreateDays([]);
              setVisitReceiveDays([]);
              setVisitFrequency("");
            }}
            disabled={!company || saving || providersLoading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--accent)] text-white rounded-lg shadow-sm ring-1 ring-white/10 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar proveedor</span>
          </button>
        </div>
      </div>

      {!authLoading && !company && !isAdminUser && (
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          Tu usuario no tiene una empresa asociada; no es posible registrar
          proveedores.
        </p>
      )}
      {!authLoading && !company && isAdminUser && (
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          Selecciona una empresa para administrar proveedores.
        </p>
      )}

      {resolvedError && (
        <div className="mb-4 text-sm text-red-500">{resolvedError}</div>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3">
          <h3 className="text-[10px] sm:text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wide">
            Lista de proveedores
          </h3>
        </div>
        {!isLoading && (
          <div className="mb-3 sm:mb-4 space-y-2 sm:space-y-3">
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--foreground)]/70" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, código o correo…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 h-10 sm:h-11 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <label
                  htmlFor="filter-with-email"
                  title="Muestra solo proveedores con correo de notificación"
                  className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 px-3 py-2 rounded-lg border border-[var(--input-border)] bg-[var(--card-bg)]/30 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    id="filter-with-email"
                    checked={showOnlyWithEmail}
                    onChange={(e) => {
                      setShowOnlyWithEmail(e.target.checked);
                      setCurrentPage(1);
                    }}
                    className="mt-0.5 sm:mt-0 w-4 h-4 cursor-pointer"
                  />
                  <span className="text-xs sm:text-sm text-[var(--foreground)] whitespace-nowrap">
                    Solo con correo
                  </span>
                  <span className="sm:hidden text-[10px] text-[var(--muted-foreground)] leading-tight">
                    Solo proveedores con correo de notificación.
                  </span>
                </label>
                <div className="hidden sm:block text-[10px] sm:text-xs text-[var(--muted-foreground)] leading-tight">
                  Filtra por correo de notificación.
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="items-per-page"
                  className="text-xs sm:text-sm text-[var(--muted-foreground)] whitespace-nowrap"
                >
                  Mostrar
                </label>
                <select
                  id="items-per-page"
                  value={
                    itemsPerPage === "all" ? "all" : itemsPerPage.toString()
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    setItemsPerPage(value === "all" ? "all" : parseInt(value));
                    setCurrentPage(1);
                  }}
                  className="w-full sm:w-auto px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg text-xs sm:text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                >
                  <option value="all">Todos</option>
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="15">15</option>
                  <option value="20">20</option>
                </select>
              </div>

              {itemsPerPage !== "all" && totalPages > 1 && (
                <div className="flex items-center gap-2 justify-center sm:justify-end">
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                    disabled={currentPage === 1}
                    className="p-2.5 sm:p-2 bg-[var(--accent)] text-white rounded-lg disabled:opacity-50 transition-colors"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[var(--foreground)] text-xs sm:text-sm whitespace-nowrap px-1">
                    {currentPage}/{totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                    }
                    disabled={currentPage === totalPages}
                    className="p-2.5 sm:p-2 bg-[var(--accent)] text-white rounded-lg disabled:opacity-50 transition-colors"
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {isLoading ? (
          <p className="text-xs sm:text-sm text-[var(--muted-foreground)] py-4 text-center">
            Cargando proveedores...
          </p>
        ) : (
          <div>
            <ul className="space-y-1.5 sm:space-y-2">
              {filteredProviders.length === 0 && (
                <li className="text-xs sm:text-sm text-[var(--muted-foreground)] py-4 text-center">
                  {searchTerm
                    ? "No se encontraron proveedores."
                    : "Aun no hay proveedores."}
                </li>
              )}
              {paginatedProviders.map((p) => (
                <li
                  key={p.code}
                  className="group overflow-hidden rounded-lg border border-[var(--input-border)] bg-[var(--card-bg)]/35 hover:bg-[var(--card-bg)]/50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row">
                    <div className="flex-1 min-w-0 px-3 sm:px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm sm:text-base text-[var(--foreground)] font-semibold truncate">
                              {p.name}
                            </span>
                            {p.correonotifi?.trim() && (
                              <span
                                title={`Correo: ${p.correonotifi}`}
                                className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-0.5 text-[10px] text-[var(--foreground)]"
                              >
                                <Mail className="w-3.5 h-3.5 text-[var(--accent)]" />
                                <span className="truncate">Con correo</span>
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] sm:text-xs text-[var(--muted-foreground)]">
                            <span className="inline-flex items-center rounded-full border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-0.5">
                              Código: <span className="ml-1 text-[var(--foreground)]">{p.code}</span>
                            </span>
                            <span className="inline-flex items-center rounded-full border border-[var(--input-border)] bg-[var(--card-bg)]/25 px-2 py-0.5">
                              Empresa: <span className="ml-1 text-[var(--foreground)]">{p.company}</span>
                            </span>
                            {p.type && (
                              <span className="inline-flex items-center rounded-full border border-[var(--input-border)] bg-[var(--card-bg)]/25 px-2 py-0.5">
                                Tipo: <span className="ml-1 text-[var(--foreground)]">{p.type}</span>
                              </span>
                            )}
                            {p.category && (
                              <span className="inline-flex items-center rounded-full border border-[var(--input-border)] bg-[var(--input-bg)] px-2 py-0.5">
                                {p.category}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 px-2.5 py-2 sm:px-3 sm:py-3 border-t sm:border-t-0 sm:border-l border-[var(--input-border)] bg-black/10">
                      <button
                        type="button"
                        className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50 p-2.5 sm:p-2 rounded-md hover:bg-white/5 transition-colors"
                        onClick={() => openEditProvider(p.code)}
                        disabled={saving || deletingCode !== null}
                        title="Editar proveedor"
                        aria-label="Editar proveedor"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>

                      <div className="w-px h-7 bg-[var(--input-border)]" />

                      <button
                        type="button"
                        className="text-red-500 hover:text-red-400 disabled:opacity-50 p-2.5 sm:p-2 rounded-md border border-red-500/30 bg-red-500/10 hover:bg-red-500/15 transition-colors"
                        onClick={() => openRemoveModal(p.code, p.name)}
                        disabled={
                          deletingCode === p.code ||
                          saving ||
                          deletingCode !== null
                        }
                        title="Eliminar (requiere confirmación)"
                        aria-label="Eliminar proveedor"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmState.open}
        title="Eliminar proveedor"
        message={`Quieres eliminar el proveedor "${confirmState.name || confirmState.code
          }"? Esta accion no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        actionType="delete"
        loading={deletingCode !== null && deletingCode === confirmState.code}
        onConfirm={confirmRemoveProvider}
        onCancel={cancelRemoveModal}
      />

      <ConfirmModal
        open={similarConfirmOpen}
        title="Nombre demasiado similar"
        message={similarConfirmMessage}
        confirmText="Continuar"
        cancelText="Cancelar"
        actionType="change"
        loading={saving}
        onConfirm={async () => {
          const pending = pendingProviderSaveRef.current;
          if (!pending) {
            setSimilarConfirmOpen(false);
            return;
          }

          try {
            setSaving(true);
            setFormError(null);

            if (pending.mode === "update" && pending.code) {
              await updateProvider(
                pending.code,
                pending.name,
                pending.providerType,
                pending.correonotifi,
                pending.visit
              );
            } else {
              await addProvider(
                pending.name,
                pending.providerType,
                pending.correonotifi,
                pending.visit
              );

              await sendEgresoProviderCreatedEmailToOwner(
                pending.name,
                pending.providerType
              );
            }

            pendingProviderSaveRef.current = null;
            setProviderName("");
            setProviderType("");
            setEditingProviderCode(null);
            setAddNotification(false);
            setSelectedAdminId("");

            setAddVisit(false);
            setVisitCreateDays([]);
            setVisitReceiveDays([]);
            setVisitFrequency("");

            setProviderDrawerOpen(false);
            setSimilarConfirmOpen(false);
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : "No se pudo guardar el proveedor.";
            setFormError(message);
          } finally {
            setSaving(false);
          }
        }}
        onCancel={() => {
          pendingProviderSaveRef.current = null;
          setSimilarConfirmOpen(false);
        }}
      />

      <Drawer
        anchor="right"
        open={providerDrawerOpen}
        onClose={() => {
          setProviderDrawerOpen(false);
          setFormError(null);
          setProviderTypeError("");
          setProviderName("");
          setProviderType("");
          setEditingProviderCode(null);

          setAddVisit(false);
          setVisitCreateDays([]);
          setVisitReceiveDays([]);
          setVisitFrequency("");
        }}
        PaperProps={{
          sx: {
            width: { xs: "100vw", sm: 460 },
            maxWidth: "100vw",
            bgcolor: "#1f262a",
            color: "#ffffff",
          },
        }}
      >
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: 3,
              py: 2,
            }}
          >
            <Typography variant="h6" component="h3" sx={{ fontWeight: 600 }}>
              {editingProviderCode ? "Editar proveedor" : "Agregar proveedor"}
            </Typography>
            <IconButton
              aria-label="Cerrar"
              onClick={() => {
                setProviderDrawerOpen(false);
                setFormError(null);
                setProviderTypeError("");
                setProviderName("");
                setProviderType("");
                setEditingProviderCode(null);
                setAddNotification(false);
                setSelectedAdminId("");

                setAddVisit(false);
                setVisitCreateDays([]);
                setVisitReceiveDays([]);
                setVisitFrequency("");
              }}
              sx={{ color: "var(--foreground)" }}
            >
              <X className="w-4 h-4" />
            </IconButton>
          </Box>
          <Divider sx={{ borderColor: "var(--input-border)" }} />
          <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 3 }}>
            {company && (
              <p className="text-xs text-[var(--muted-foreground)] mb-3">
                Empresa asignada:{" "}
                <span className="font-medium text-[var(--foreground)]">
                  {company}
                </span>
              </p>
            )}
            {resolvedError && (
              <div className="mb-4 text-sm text-red-500">{resolvedError}</div>
            )}

            <div className="flex flex-col gap-3">
              <input
                className="w-full p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded"
                placeholder="Nombre del proveedor"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value.toUpperCase())}
                disabled={!company || saving || deletingCode !== null}
                autoFocus
              />
              <select
                value={providerType}
                onChange={(e) => {
                  const nextType = e.target.value as FondoMovementType | "";
                  setProviderType(nextType);
                  setProviderTypeError("");

                  const normalized = String(nextType || "")
                    .trim()
                    .toUpperCase();

                  if (normalized === "COMPRA INVENTARIO") {
                    // Al seleccionar COMPRA INVENTARIO, activar visita automáticamente.
                    setAddVisit(true);
                  } else {
                    // Si se cambia a otro tipo, limpiar configuración de visita.
                    setAddVisit(false);
                    setVisitCreateDays([]);
                    setVisitReceiveDays([]);
                    setVisitFrequency("");
                  }
                }}
                className={`w-full p-3 bg-[var(--input-bg)] border rounded ${providerTypeError
                  ? "border-red-500"
                  : "border-[var(--input-border)]"
                  }`}
                disabled={!company || saving}
              >
                <option value="">Seleccione un tipo</option>
                <optgroup label="Ingresos">
                  {ingresoTypes.map((opt) => (
                    <option key={opt} value={opt}>
                      {formatMovementType(opt)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Gastos">
                  {gastoTypes.map((opt) => (
                    <option key={opt} value={opt}>
                      {formatMovementType(opt)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Egresos">
                  {egresoTypes.map((opt) => (
                    <option key={opt} value={opt}>
                      {formatMovementType(opt)}
                    </option>
                  ))}
                </optgroup>
              </select>
              {providerTypeError && (
                <p className="text-xs text-red-500">{providerTypeError}</p>
              )}

              {/* Checkbox para agregar notificación */}
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="add-notification-checkbox"
                  checked={addNotification}
                  onChange={(e) => {
                    setAddNotification(e.target.checked);
                    if (!e.target.checked) {
                      setSelectedAdminId("");
                    }
                  }}
                  disabled={!company || saving}
                  className="w-4 h-4 cursor-pointer"
                />
                <label
                  htmlFor="add-notification-checkbox"
                  className="text-sm text-[var(--foreground)] cursor-pointer"
                >
                  Agregar Notificación
                </label>
              </div>

              {/* Selector de admin para notificación */}
              {addNotification && (
                <div className="mt-2">
                  {loadingAdmins ? (
                    <div className="text-xs text-[var(--muted-foreground)] p-2">
                      Cargando administradores...
                    </div>
                  ) : adminUsers.length === 0 ? (
                    <div className="text-xs text-red-500 p-2">
                      {isSuperAdminUser
                        ? "No hay administradores disponibles con correo electrónico para la empresa seleccionada."
                        : "No hay administradores disponibles con correo electrónico en tu organización."}
                    </div>
                  ) : (
                    <>
                      <label className="text-xs text-[var(--muted-foreground)] mb-1 block">
                        Seleccionar administrador para notificaciones:
                      </label>
                      <select
                        value={selectedAdminId}
                        onChange={(e) => setSelectedAdminId(e.target.value)}
                        className="w-full p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm"
                        disabled={!company || saving}
                      >
                        <option value="">Seleccione un administrador</option>
                        {adminUsers.map((admin) => (
                          <option key={admin.id} value={admin.id || ""}>
                            {admin.name || admin.email} ({admin.email})
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              )}

              {isCompraInventarioProvider && (
                <div className="mt-2 rounded border border-[var(--input-border)] p-3 bg-[var(--input-bg)]">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="add-visit-checkbox"
                      checked={addVisit}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAddVisit(checked);
                        if (!checked) {
                          setVisitCreateDays([]);
                          setVisitReceiveDays([]);
                          setVisitFrequency("");
                          setVisitStartDateISO("");
                        }
                      }}
                      disabled={!company || saving}
                      className="w-4 h-4 cursor-pointer"
                    />
                    <label
                      htmlFor="add-visit-checkbox"
                      className="text-sm text-[var(--foreground)] cursor-pointer"
                    >
                      Agregar visita
                    </label>
                  </div>

                  {addVisit && (
                    <div className="mt-3 space-y-3">
                      <div>
                        <div className="text-xs text-[var(--muted-foreground)] mb-1">
                          Día de realizar pedido
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {VISIT_DAY_ORDER.map((day) => {
                            const selected = visitCreateDays.includes(day);
                            return (
                              <button
                                key={`visit-create-${day}`}
                                type="button"
                                onClick={() =>
                                  toggleVisitDay(day, setVisitCreateDays)
                                }
                                title={VISIT_DAY_TITLES[day]}
                                className={`px-2 py-1 rounded border text-xs transition-colors ${selected
                                  ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                                  : "bg-[var(--input-bg)] text-[var(--foreground)] border-[var(--input-border)]"
                                  }`}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs text-[var(--muted-foreground)] mb-1">
                          Día de recibir pedido
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {VISIT_DAY_ORDER.map((day) => {
                            const selected = visitReceiveDays.includes(day);
                            return (
                              <button
                                key={`visit-receive-${day}`}
                                type="button"
                                onClick={() =>
                                  toggleVisitDay(day, setVisitReceiveDays)
                                }
                                title={VISIT_DAY_TITLES[day]}
                                className={`px-2 py-1 rounded border text-xs transition-colors ${selected
                                  ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                                  : "bg-[var(--input-bg)] text-[var(--foreground)] border-[var(--input-border)]"
                                  }`}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-[var(--muted-foreground)] mb-1 block">
                          Frecuencia
                        </label>
                        <select
                          value={visitFrequency}
                          onChange={(e) =>
                            setVisitFrequency(e.target.value as ProviderVisitFrequency | "")
                          }
                          className="w-full p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm"
                          disabled={!company || saving}
                        >
                          <option value="">Seleccione una frecuencia</option>
                          {VISIT_FREQUENCY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {visitFrequency && visitFrequency !== "SEMANAL" ? (
                        <div>
                          <label className="text-xs text-[var(--muted-foreground)] mb-1 block">
                            Fecha inicial
                          </label>
                          <input
                            type="date"
                            value={visitStartDateISO}
                            onChange={(e) => setVisitStartDateISO(e.target.value)}
                            className="w-full p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm"
                            disabled={!company || saving}
                          />
                          <div className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                            Define desde qué semana empieza el ciclo (quincenal/22 días/mensual).
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => {
                  setProviderDrawerOpen(false);
                  setFormError(null);
                  setProviderName("");
                  setProviderType("");
                  setEditingProviderCode(null);
                  setAddNotification(false);
                  setSelectedAdminId("");

                  setAddVisit(false);
                  setVisitCreateDays([]);
                  setVisitReceiveDays([]);
                  setVisitFrequency("");
                  setVisitStartDateISO("");
                }}
                className="px-4 py-2 border border-[var(--input-border)] rounded text-[var(--foreground)] hover:bg-[var(--muted)]"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const name = providerName.trim().toUpperCase();
                  if (!name) {
                    setFormError("Nombre requerido.");
                    return;
                  }
                  if (!company) {
                    setFormError("Tu usuario no tiene una empresa asignada.");
                    return;
                  }

                  if (!providerType) {
                    setProviderTypeError("Debe seleccionar un tipo.");
                    return;
                  }
                  if (providersLoading) {
                    setFormError("Espera a que carguen los proveedores.");
                    return;
                  }

                  // Validar que si se marcó notificación, se haya seleccionado un admin
                  if (addNotification && !selectedAdminId) {
                    setFormError(
                      "Debe seleccionar un administrador para las notificaciones."
                    );
                    return;
                  }

                  // Obtener el correo del admin seleccionado
                  let correonotifi: string | undefined = undefined;
                  if (addNotification && selectedAdminId) {
                    const selectedAdmin = adminUsers.find(
                      (admin) => admin.id === selectedAdminId
                    );
                    if (selectedAdmin?.email) {
                      correonotifi = selectedAdmin.email;
                    }
                  }

                  let visit: ProviderVisitConfig | undefined = undefined;
                  if (isCompraInventarioProvider && addVisit) {
                    if (visitCreateDays.length === 0) {
                      setFormError("Debe seleccionar al menos un día para crear pedido.");
                      return;
                    }
                    if (visitReceiveDays.length === 0) {
                      setFormError("Debe seleccionar al menos un día para recibir pedido.");
                      return;
                    }
                    if (!visitFrequency) {
                      setFormError("Debe seleccionar una frecuencia de visita.");
                      return;
                    }

                    let startDateKey: number | undefined = undefined;
                    if (visitFrequency !== "SEMANAL") {
                      const key = isoDateToDateKey(visitStartDateISO);
                      if (!key) {
                        setFormError("Debe seleccionar una fecha inicial válida.");
                        return;
                      }
                      startDateKey = key;
                    }

                    visit = {
                      createOrderDays: visitCreateDays,
                      receiveOrderDays: visitReceiveDays,
                      frequency: visitFrequency as ProviderVisitFrequency,
                      ...(typeof startDateKey === "number" ? { startDateKey } : {}),
                    };
                  }

                  try {
                    setFormError(null);
                    setProviderTypeError("");

                    const normalizedProviderType = providerType || undefined;

                    if (editingProviderCode) {
                      const otherProviders = providers.filter(
                        (p) => p.code !== editingProviderCode
                      );
                      if (
                        otherProviders.some(
                          (p) => p.name.toUpperCase() === name
                        )
                      ) {
                        setFormError(`El proveedor "${name}" ya existe.`);
                        return;
                      }

                      const { best, score } = findBestStringMatch(
                        name,
                        otherProviders.map((p) => p.name)
                      );
                      if (best && score >= 0.9) {
                        const similarProvider = otherProviders.find(
                          (p) => p.name === best
                        );
                        const similarTypeLabel = similarProvider?.type
                          ? formatMovementType(similarProvider.type)
                          : "";
                        pendingProviderSaveRef.current = {
                          mode: "update",
                          code: editingProviderCode,
                          name,
                          providerType: normalizedProviderType,
                          correonotifi,
                          visit,
                        };
                        setSimilarConfirmMessage(
                          <div className="w-full flex flex-col items-center text-center">
                            <p className="text-center">
                              Detectamos un nombre demasiado similar.
                            </p>

                            <div className="mt-3 space-y-2">
                              <div className="flex items-start justify-center gap-2 w-full">
                                <UserPlus className="w-4 h-4 text-[var(--muted-foreground)] mt-0.5" />
                                <div className="min-w-0 flex flex-col items-center">
                                  <div className="text-xs text-[var(--muted-foreground)]">
                                    Nuevo proveedor
                                  </div>
                                  <div className="font-semibold break-words">
                                    &apos;{name}&apos;
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-start justify-center gap-2 w-full">
                                <Layers className="w-4 h-4 text-[var(--muted-foreground)] mt-0.5" />
                                <div className="min-w-0 flex flex-col items-center">
                                  <div className="text-xs text-[var(--muted-foreground)]">
                                    Proveedor existente
                                  </div>
                                  <div className="font-semibold break-words">
                                    &apos;{best}&apos;
                                  </div>
                                </div>
                              </div>

                              {similarTypeLabel && (
                                <div className="flex items-start justify-center gap-2 w-full">
                                  <Tag className="w-4 h-4 text-[var(--muted-foreground)] mt-0.5" />
                                  <div className="min-w-0 flex flex-col items-center">
                                    <div className="text-xs text-[var(--muted-foreground)]">
                                      Tipo del existente
                                    </div>
                                    <div className="break-words">
                                      {similarTypeLabel}
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div className="text-xs text-[var(--muted-foreground)] pt-1 text-center">
                                Similitud: {Math.round(score * 100)}%
                              </div>
                            </div>

                            <p className="mt-4 text-center">
                              ¿Deseas continuar y guardarlo de todas formas?
                            </p>
                          </div>
                        );
                        setSimilarConfirmOpen(true);
                        return;
                      }

                      setSaving(true);
                      await updateProvider(
                        editingProviderCode,
                        name,
                        normalizedProviderType,
                        correonotifi,
                        visit
                      );
                    } else {
                      if (
                        providers.some((p) => p.name.toUpperCase() === name)
                      ) {
                        setFormError(`El proveedor "${name}" ya existe.`);
                        return;
                      }

                      const { best, score } = findBestStringMatch(
                        name,
                        providers.map((p) => p.name)
                      );
                      if (best && score >= 0.9) {
                        const similarProvider = providers.find(
                          (p) => p.name === best
                        );
                        const similarTypeLabel = similarProvider?.type
                          ? formatMovementType(similarProvider.type)
                          : "";
                        pendingProviderSaveRef.current = {
                          mode: "create",
                          name,
                          providerType: normalizedProviderType,
                          correonotifi,
                          visit,
                        };
                        setSimilarConfirmMessage(
                          <div className="w-full flex flex-col items-center text-center">
                            <p className="text-center">
                              Detectamos un nombre demasiado similar.
                            </p>

                            <div className="mt-3 space-y-2">
                              <div className="flex items-start justify-center gap-2 w-full">
                                <UserPlus className="w-4 h-4 text-[var(--muted-foreground)] mt-0.5" />
                                <div className="min-w-0 flex flex-col items-center">
                                  <div className="text-xs text-[var(--muted-foreground)]">
                                    Nuevo proveedor
                                  </div>
                                  <div className="font-semibold break-words">
                                    &apos;{name}&apos;
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-start justify-center gap-2 w-full">
                                <Layers className="w-4 h-4 text-[var(--muted-foreground)] mt-0.5" />
                                <div className="min-w-0 flex flex-col items-center">
                                  <div className="text-xs text-[var(--muted-foreground)]">
                                    Proveedor existente
                                  </div>
                                  <div className="font-semibold break-words">
                                    &apos;{best}&apos;
                                  </div>
                                </div>
                              </div>

                              {similarTypeLabel && (
                                <div className="flex items-start justify-center gap-2 w-full">
                                  <Tag className="w-4 h-4 text-[var(--muted-foreground)] mt-0.5" />
                                  <div className="min-w-0 flex flex-col items-center">
                                    <div className="text-xs text-[var(--muted-foreground)]">
                                      Tipo del existente
                                    </div>
                                    <div className="break-words">
                                      {similarTypeLabel}
                                    </div>
                                  </div>
                                </div>
                              )}

                              <div className="text-xs text-[var(--muted-foreground)] pt-1 text-center">
                                Similitud: {Math.round(score * 100)}%
                              </div>
                            </div>

                            <p className="mt-4 text-center">
                              ¿Deseas continuar y guardarlo de todas formas?
                            </p>
                          </div>
                        );
                        setSimilarConfirmOpen(true);
                        return;
                      }

                      setSaving(true);
                      await addProvider(
                        name,
                        normalizedProviderType,
                        correonotifi,
                        visit
                      );

                      await sendEgresoProviderCreatedEmailToOwner(
                        name,
                        normalizedProviderType
                      );
                    }
                    setProviderName("");
                    setProviderType("");
                    setEditingProviderCode(null);
                    setAddNotification(false);
                    setSelectedAdminId("");

                    setAddVisit(false);
                    setVisitCreateDays([]);
                    setVisitReceiveDays([]);
                    setVisitFrequency("");

                    setProviderTypeError("");
                    setProviderDrawerOpen(false);
                  } catch (err) {
                    const message =
                      err instanceof Error
                        ? err.message
                        : "No se pudo guardar el proveedor.";
                    setFormError(message);
                  } finally {
                    setSaving(false);
                  }
                }}
                className="px-4 py-2 bg-[var(--accent)] text-white rounded disabled:opacity-50"
                disabled={!company || saving || deletingCode !== null}
              >
                {saving
                  ? editingProviderCode
                    ? "Actualizando..."
                    : "Guardando..."
                  : editingProviderCode
                    ? "Actualizar"
                    : "Guardar"}
              </button>
            </div>
          </Box>
        </Box>
      </Drawer>
    </div>
  );
}

export function FondoSection({
  id,
  mode = "all",
  namespace = "fg",
  companySelectorPlacement = "content",
  onCompanySelectorChange,
}: {
  id?: string;
  mode?: "all" | "ingreso" | "egreso";
  namespace?: string;
  companySelectorPlacement?: "content" | "external";
  onCompanySelectorChange?: (node: React.ReactNode | null) => void;
}) {
  const [quickRange, setQuickRange] = React.useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const assignedCompany = user?.ownercompanie?.trim() ?? "";
  const { ownerIds: actorOwnerIds, primaryOwnerId } = useActorOwnership(user);
  const allowedOwnerIds = useMemo(() => {
    const set = new Set<string>();
    actorOwnerIds.forEach((id) => {
      const normalized =
        typeof id === "string" ? id.trim() : String(id || "").trim();
      if (normalized) set.add(normalized);
    });
    if (user?.ownerId) {
      const normalized = String(user.ownerId).trim();
      if (normalized) set.add(normalized);
    }
    return set;
  }, [actorOwnerIds, user?.ownerId]);
  const resolvedOwnerId = useMemo(() => {
    const normalizedPrimary = (primaryOwnerId || "").trim();
    if (normalizedPrimary) return normalizedPrimary;
    const [firstAllowed] = Array.from(allowedOwnerIds);
    if (firstAllowed) return firstAllowed;
    return "";
  }, [allowedOwnerIds, primaryOwnerId]);
  const isAdminUser = user?.role === "admin";
  const isSuperAdminUser = user?.role === "superadmin";
  const [superAdminTotalsOpen, setSuperAdminTotalsOpen] = useState(false);
  const canSelectCompany = isAdminUser || isSuperAdminUser;
  const [adminCompany, setAdminCompany] = useState(() => {
    if (typeof window === "undefined") return assignedCompany;
    try {
      const stored = localStorage.getItem(SHARED_COMPANY_STORAGE_KEY);
      return stored || assignedCompany;
    } catch {
      return assignedCompany;
    }
  });
  const company = canSelectCompany ? adminCompany : assignedCompany;
  const {
    providers,
    loading: providersLoading,
    error: providersError,
  } = useProviders(company);
  const { showToast } = useToast();
  const [ownerAdminEmail, setOwnerAdminEmail] = useState<string | null>(null);
  const [ownerCompanies, setOwnerCompanies] = useState<Empresas[]>([]);
  const [ownerCompaniesLoading, setOwnerCompaniesLoading] = useState(false);
  const [ownerCompaniesError, setOwnerCompaniesError] = useState<string | null>(
    null
  );

  const sortedOwnerCompanies = useMemo(() => {
    return ownerCompanies.slice().sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", "es", {
        sensitivity: "base",
      })
    );
  }, [ownerCompanies]);

  useEffect(() => {
    const normalizeCompanyKey = (value: unknown) =>
      String(value || "")
        .trim()
        .toLowerCase();
    const getEmpresaCompanyKey = (emp: Empresas) =>
      String(emp?.name || emp?.ubicacion || emp?.id || "").trim();

    if (!canSelectCompany) {
      setOwnerCompanies([]);
      setOwnerCompaniesLoading(false);
      setOwnerCompaniesError(null);
      return;
    }

    if (isAdminUser && allowedOwnerIds.size === 0) {
      setOwnerCompanies([]);
      setOwnerCompaniesLoading(false);
      setOwnerCompaniesError(
        "No se pudo determinar el ownerId asociado a tu cuenta."
      );
      return;
    }

    let isMounted = true;
    setOwnerCompaniesLoading(true);
    setOwnerCompaniesError(null);

    EmpresasService.getAllEmpresas()
      .then((empresas) => {
        if (!isMounted) return;
        const filtered = isAdminUser
          ? empresas.filter((emp) => {
            const owner = (emp.ownerId || "").trim();
            if (!owner) return false;
            return allowedOwnerIds.has(owner);
          })
          : empresas;
        setOwnerCompanies(filtered);
        setAdminCompany((current) => {
          const normalizedCurrent = normalizeCompanyKey(current);
          if (normalizedCurrent.length > 0) {
            const exists = filtered.some((emp) => {
              const candidates = [emp.name, emp.ubicacion, emp.id]
                .map(normalizeCompanyKey)
                .filter(Boolean);
              return candidates.includes(normalizedCurrent);
            });
            if (exists) return current;
          }

          const fallback = filtered[0];
          return fallback ? getEmpresaCompanyKey(fallback) : "";
        });
      })
      .catch((err) => {
        if (!isMounted) return;
        setOwnerCompanies([]);
        setOwnerCompaniesError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar las empresas disponibles."
        );
      })
      .finally(() => {
        if (isMounted) setOwnerCompaniesLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [allowedOwnerIds, canSelectCompany, isAdminUser]);

  const activeOwnerId = useMemo(() => {
    const normalizeCompanyKey = (value: unknown) =>
      String(value || "")
        .trim()
        .toLowerCase();

    if (canSelectCompany) {
      const normalizedCompany = normalizeCompanyKey(adminCompany);
      if (normalizedCompany.length > 0) {
        const match = ownerCompanies.find((emp) => {
          const candidates = [emp.name, emp.ubicacion, emp.id]
            .map(normalizeCompanyKey)
            .filter(Boolean);
          return candidates.includes(normalizedCompany);
        });
        const ownerId =
          typeof match?.ownerId === "string" ? match.ownerId.trim() : "";
        if (ownerId) return ownerId;
      }

      const fallbackAdminOwner =
        typeof ownerCompanies[0]?.ownerId === "string"
          ? ownerCompanies[0].ownerId.trim()
          : "";
      if (fallbackAdminOwner) return fallbackAdminOwner;
    }
    return resolvedOwnerId;
  }, [adminCompany, canSelectCompany, ownerCompanies, resolvedOwnerId]);

  useEffect(() => {
    let cancelled = false;

    if (!activeOwnerId) {
      setOwnerAdminEmail(null);
      return () => {
        cancelled = true;
      };
    }

    setOwnerAdminEmail(null);

    const loadAdminEmail = async () => {
      try {
        const admin = await UsersService.getPrimaryAdminByOwner(activeOwnerId);
        if (cancelled) return;
        const email =
          typeof admin?.email === "string" ? admin.email.trim() : "";
        setOwnerAdminEmail(email.length > 0 ? email : null);
      } catch (error) {
        if (cancelled) return;
        console.error(
          "Error loading owner admin email for daily closing notifications:",
          error
        );
        setOwnerAdminEmail(null);
      }
    };

    void loadAdminEmail();

    return () => {
      cancelled = true;
    };
  }, [activeOwnerId]);
  const permissions =
    user?.permissions || getDefaultPermissions(user?.role || "user");
  const hasGeneralAccess = Boolean(permissions.fondogeneral);
  const requiredPermissionKey =
    NAMESPACE_PERMISSIONS[namespace] || "fondogeneral";
  const hasSpecificAccess = Boolean(permissions[requiredPermissionKey]);
  const canAccessSection =
    namespace === "fg"
      ? hasGeneralAccess
      : hasGeneralAccess && hasSpecificAccess;
  const namespaceDescription =
    NAMESPACE_DESCRIPTIONS[namespace] || "esta sección del Fondo General";
  const accountKey = useMemo(
    () => getAccountKeyFromNamespace(namespace),
    [namespace]
  );

  // Estado para tipos de movimientos dinámicos
  const [fondoTypesLoaded, setFondoTypesLoaded] = useState(false);
  const [, setIngresoTypes] = useState<string[]>([]);
  const [, setGastoTypes] = useState<string[]>([]);
  const [, setEgresoTypes] = useState<string[]>([]);

  const [fondoEntries, setFondoEntries] = useState<FondoEntry[]>([]);
  const [companyEmployees, setCompanyEmployees] = useState<string[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);

  const [selectedProvider, setSelectedProvider] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const defaultPaymentType: FondoEntry["paymentType"] =
    mode === "ingreso"
      ? FONDO_INGRESO_TYPES[0]
      : mode === "egreso"
        ? FONDO_EGRESO_TYPES[0]
        : "COMPRA INVENTARIO";
  const [paymentType, setPaymentType] =
    useState<FondoEntry["paymentType"]>(defaultPaymentType);
  const [egreso, setEgreso] = useState("");
  const [ingreso, setIngreso] = useState("");
  const [manager, setManager] = useState("");
  const [notes, setNotes] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [initialAmount, setInitialAmount] = useState("0");
  const [initialAmountUSD, setInitialAmountUSD] = useState("0");
  // Snapshot de balances persistidos. NO depende de `fondoEntries` para evitar
  // que filtros (rango de fecha) alteren el currentBalance.
  const [ledgerSnapshot, setLedgerSnapshot] = useState<{
    initialCRC: number;
    currentCRC: number;
    initialUSD: number;
    currentUSD: number;
  }>(() => ({
    initialCRC: 0,
    currentCRC: 0,
    initialUSD: 0,
    currentUSD: 0,
  }));
  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [movementAutoCloseLocked, setMovementAutoCloseLocked] = useState(false);
  const [movementCurrency, setMovementCurrency] = useState<"CRC" | "USD">(
    "CRC"
  );
  const [providerError, setProviderError] = useState("");
  const [invoiceError, setInvoiceError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [managerError, setManagerError] = useState("");
  const [dailyClosingModalOpen, setDailyClosingModalOpen] = useState(false);
  const [editingDailyClosingId, setEditingDailyClosingId] = useState<
    string | null
  >(null);
  const [dailyClosingInitialValues, setDailyClosingInitialValues] =
    useState<DailyClosingFormValues | null>(null);
  const [dailyClosings, setDailyClosings] = useState<DailyClosingRecord[]>([]);
  const [dailyClosingsHydrated, setDailyClosingsHydrated] = useState(false);
  const [dailyClosingsRefreshing, setDailyClosingsRefreshing] = useState(false);
  const [dailyClosingHistoryOpen, setDailyClosingHistoryOpen] = useState(false);
  const [expandedClosings, setExpandedClosings] = useState<Set<string>>(
    new Set()
  );
  const [pendingCierreDeCaja, setPendingCierreDeCaja] = useState(false);
  const dailyClosingsRequestCountRef = useRef(0);
  const isComponentMountedRef = useRef(true);
  const loadedDailyClosingKeysRef = useRef<Set<string>>(new Set());
  const loadingDailyClosingKeysRef = useRef<Set<string>>(new Set());
  const lastEditSaveTimestampRef = useRef<number>(0);
  const editingInProgressRef = useRef<boolean>(false);

  const [pageSize, setPageSize] = useState<"daily" | number | "all">(() => {
    if (typeof window !== "undefined") {
      try {
        const remember = localStorage.getItem("fondogeneral-rememberFilters");
        if (remember === "true") {
          const saved = localStorage.getItem("fondogeneral-pageSize");
          if (saved === null) return "daily";
          if (saved === "daily" || saved === "all") return saved as any;
          const n = Number.parseInt(saved, 10);
          if (!Number.isNaN(n) && n > 0) return n;
        }
      } catch {
        // ignore storage errors
      }
    }
    return "daily";
  });
  const [pageIndex, setPageIndex] = useState(0);
  const [currentDailyKey, setCurrentDailyKey] = useState(() =>
    dateKeyFromDate(new Date())
  );
  const todayKey = useMemo(() => dateKeyFromDate(new Date()), []);

  const beginDailyClosingsRequest = useCallback(() => {
    dailyClosingsRequestCountRef.current += 1;
    setDailyClosingsRefreshing(true);
  }, []);

  const finishDailyClosingsRequest = useCallback(() => {
    dailyClosingsRequestCountRef.current = Math.max(
      0,
      dailyClosingsRequestCountRef.current - 1
    );
    if (!isComponentMountedRef.current) return;
    if (dailyClosingsRequestCountRef.current === 0) {
      setDailyClosingsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    isComponentMountedRef.current = true;
    return () => {
      isComponentMountedRef.current = false;
    };
  }, []);
  const [entriesHydrated, setEntriesHydrated] = useState(false);
  const [hydratedCompany, setHydratedCompany] = useState("");
  const [hydratedAccountKey, setHydratedAccountKey] =
    useState<MovementAccountKey>(accountKey);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const movementsLoadingCountRef = useRef(0);
  const beginMovementsLoading = useCallback(() => {
    movementsLoadingCountRef.current += 1;
    setMovementsLoading(true);
  }, []);
  const endMovementsLoading = useCallback(() => {
    movementsLoadingCountRef.current = Math.max(
      0,
      movementsLoadingCountRef.current - 1
    );
    if (!isComponentMountedRef.current) return;
    if (movementsLoadingCountRef.current === 0) {
      setMovementsLoading(false);
    }
  }, []);
  const [currencyEnabled, setCurrencyEnabled] = useState<
    Record<MovementCurrencyKey, boolean>
  >({
    CRC: true,
    USD: true,
  });
  const [companyData, setCompanyData] = useState<Empresas | null>(null);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<{
    open: boolean;
    entry: FondoEntry | null;
  }>({
    open: false,
    entry: null,
  });
  const [confirmOpenCreateMovement, setConfirmOpenCreateMovement] =
    useState(false);
  // Estado para indicar que se está guardando un movimiento y prevenir múltiples envíos
  const [isSaving, setIsSaving] = useState(false);
  const enabledBalanceCurrencies = useMemo(
    () =>
      (["CRC", "USD"] as MovementCurrencyKey[]).filter(
        (currency) => currencyEnabled[currency]
      ),
    [currencyEnabled]
  );
  const closingsStorageKey = useMemo(() => {
    if (accountKey !== "FondoGeneral") return null;
    const normalizedCompany = (company || "").trim();
    if (normalizedCompany.length === 0) return null;
    return buildDailyClosingStorageKey(normalizedCompany, accountKey);
  }, [company, accountKey]);
  // Audit modal state: show full before/after history when an edited entry is clicked
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditModalData, setAuditModalData] = useState<{
    history?: any[];
  } | null>(null);
  // sortAsc: when true we show oldest first (so newest appears at the bottom).
  // Default true per UX: the most recent movement should appear below.
  const [sortAsc, setSortAsc] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fondogeneral-sortAsc");
      return saved !== null ? JSON.parse(saved) : true;
    }
    return true;
  });

  // Date range filters (YYYY-MM-DD). Only query the remote range when BOTH are set.
  const [fromFilter, setFromFilter] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fondogeneral-fromFilter");
      return saved ? saved : null;
    }
    return null;
  });
  const [toFilter, setToFilter] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fondogeneral-toFilter");
      return saved ? saved : null;
    }
    return null;
  });
  const storageSnapshotRef = useRef<MovementStorage<FondoEntry> | null>(null);

  // Keep latest accountKey without re-triggering full remote reloads on tab switch.
  const accountKeyRef = useRef<MovementAccountKey>(accountKey);
  useEffect(() => {
    accountKeyRef.current = accountKey;
  }, [accountKey]);

  const applyLedgerStateFromStorage = useCallback(
    (state?: MovementStorageState | null) => {
      if (!state) return;

      const parseBalance = (value: unknown) => {
        const parsed = typeof value === "number" ? value : Number(value);
        return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
      };

      const resolveSettings = (currency: MovementCurrencyKey) => {
        const accountBalance = state.balancesByAccount?.find(
          (balance) =>
            balance.accountId === accountKey && balance.currency === currency
        );
        return {
          enabled: accountBalance?.enabled ?? true,
          initialBalance: parseBalance(accountBalance?.initialBalance ?? 0),
          currentBalance: parseBalance(accountBalance?.currentBalance ?? 0),
        };
      };

      const crcSettings = resolveSettings("CRC");
      const usdSettings = resolveSettings("USD");

      setCurrencyEnabled({
        CRC: crcSettings.enabled,
        USD: usdSettings.enabled,
      });

      setInitialAmount(crcSettings.initialBalance.toString());
      setInitialAmountUSD(usdSettings.initialBalance.toString());

      setLedgerSnapshot({
        initialCRC: crcSettings.initialBalance,
        currentCRC: crcSettings.currentBalance,
        initialUSD: usdSettings.initialBalance,
        currentUSD: usdSettings.currentBalance,
      });
    },
    [accountKey]
  );

  // Cache v2 movements per companyKey to avoid re-reading the whole subcollection when switching tabs.
  // Also stores a Firestore cursor so we can load more pages only when needed.
  const v2MovementsCacheRef = useRef<
    Record<
      string,
      {
        loaded: boolean;
        movements: FondoEntry[];
        cursor: QueryDocumentSnapshot<DocumentData> | null;
        exhausted: boolean;
        loading: boolean;
        queryKey?: string;
        startIso?: string;
        endIsoExclusive?: string;
      }
    >
  >({});

  const buildLocalDayIsoRange = useCallback((isoDateKey: string) => {
    const [yStr, mStr, dStr] = String(isoDateKey || "").split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);

    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      const now = new Date();
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0
      );
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { startIso: start.toISOString(), endIsoExclusive: end.toISOString() };
    }

    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      startIso: start.toISOString(),
      endIsoExclusive: end.toISOString(),
    };
  }, []);

  const resolveActiveMovementsQuery = useCallback((): {
    queryKey: string;
    startIso: string;
    endIsoExclusive: string;
  } => {
    if (fromFilter && toFilter) {
      const fromKey = fromFilter.trim();
      const toKey = toFilter.trim();
      const startKey = fromKey > toKey ? toKey : fromKey;
      const endKey = fromKey > toKey ? fromKey : toKey;
      const startRange = buildLocalDayIsoRange(startKey);
      const endRange = buildLocalDayIsoRange(endKey);
      return {
        queryKey: `range:${startKey}..${endKey}`,
        startIso: startRange.startIso,
        endIsoExclusive: endRange.endIsoExclusive,
      };
    }

    const dayKey = pageSize === "daily" ? currentDailyKey : todayKey;
    const range = buildLocalDayIsoRange(dayKey);
    return {
      queryKey: `day:${dayKey}`,
      startIso: range.startIso,
      endIsoExclusive: range.endIsoExclusive,
    };
  }, [
    fromFilter,
    toFilter,
    pageSize,
    currentDailyKey,
    todayKey,
    buildLocalDayIsoRange,
  ]);

  const resolveV2DocKey = useCallback(() => {
    const normalizedCompany = (company || "").trim();
    const companyKey =
      MovimientosFondosService.buildCompanyMovementsKey(normalizedCompany);
    const legacyOwnerKey = resolvedOwnerId
      ? MovimientosFondosService.buildLegacyOwnerMovementsKey(resolvedOwnerId)
      : null;

    if (v2MovementsCacheRef.current[companyKey]?.loaded) return companyKey;
    if (legacyOwnerKey && v2MovementsCacheRef.current[legacyOwnerKey]?.loaded)
      return legacyOwnerKey;

    return companyKey || legacyOwnerKey || "";
  }, [company, resolvedOwnerId]);

  const rebuildEntriesFromV2Cache = useCallback(
    (docKey: string, targetAccountKey: MovementAccountKey) => {
      const cached = v2MovementsCacheRef.current[docKey];
      if (!cached?.loaded) return;

      const scopedEntries = cached.movements.filter((rawEntry) => {
        const candidate = rawEntry as Partial<FondoEntry>;
        const movementAccount = isMovementAccountKey(candidate.accountId)
          ? candidate.accountId
          : targetAccountKey;
        return movementAccount === targetAccountKey;
      });

      const entries = sanitizeFondoEntries(
        scopedEntries,
        undefined,
        targetAccountKey
      ).sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setFondoEntries(entries);

      const state = storageSnapshotRef.current?.state;
      if (state) {
        applyLedgerStateFromStorage(state);
      }
    },
    [applyLedgerStateFromStorage]
  );

  const ensureV2MovementsLoaded = useCallback(
    async (docKey: string) => {
      if (!docKey) return;

      const targetAccountKey = accountKeyRef.current;
      const { queryKey, startIso, endIsoExclusive } =
        resolveActiveMovementsQuery();

      const cached = v2MovementsCacheRef.current[docKey] ?? {
        loaded: false,
        movements: [] as FondoEntry[],
        cursor: null as QueryDocumentSnapshot<DocumentData> | null,
        exhausted: false,
        loading: false,
        queryKey: undefined as string | undefined,
        startIso: undefined as string | undefined,
        endIsoExclusive: undefined as string | undefined,
      };

      if (cached.loading) return;

      if (
        cached.loaded &&
        cached.queryKey === queryKey &&
        cached.startIso === startIso &&
        cached.endIsoExclusive === endIsoExclusive
      ) {
        rebuildEntriesFromV2Cache(docKey, targetAccountKey);
        return;
      }

      console.log("[FG-QUERY] MovimientosFondos v2 query", {
        docKey,
        accountKey: targetAccountKey,
        queryKey,
        createdAt: {
          gte: startIso,
          lt: endIsoExclusive,
        },
        orderBy: "createdAt desc",
        pageSize: 500,
        ui: {
          pageSizeMode: pageSize,
          currentDailyKey,
          todayKey,
          fromFilter,
          toFilter,
        },
      });

      const nextCache = {
        ...cached,
        loaded: false,
        movements: [] as FondoEntry[],
        cursor: null as QueryDocumentSnapshot<DocumentData> | null,
        exhausted: false,
        loading: true,
        queryKey,
        startIso,
        endIsoExclusive,
      };

      v2MovementsCacheRef.current[docKey] = nextCache;
      beginMovementsLoading();

      try {
        let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
        let exhausted = false;
        const movements: FondoEntry[] = [];

        type MovementsPageResult = {
          items: Array<FondoEntry & { id: string }>;
          cursor: QueryDocumentSnapshot<DocumentData> | null;
          exhausted: boolean;
        };

        // Safety cap: avoid unbounded reads.
        let pages = 0;
        const maxPages = 50; // 50 * 500 = 25k

        while (!exhausted && pages < maxPages) {
          const pageResult: MovementsPageResult =
            await MovimientosFondosService.listMovementsPageByCreatedAtRange(
              docKey,
              {
                startIso,
                endIsoExclusive,
                pageSize: 500,
                cursor,
              }
            );

          if (!pageResult.items || pageResult.items.length === 0) {
            exhausted = true;
            break;
          }

          movements.push(...(pageResult.items as FondoEntry[]));
          cursor = pageResult.cursor;
          exhausted = pageResult.exhausted;
          pages += 1;
        }

        v2MovementsCacheRef.current[docKey] = {
          ...nextCache,
          loaded: true,
          movements,
          cursor,
          exhausted,
          loading: false,
        };
      } finally {
        const latest = v2MovementsCacheRef.current[docKey];
        if (latest) {
          v2MovementsCacheRef.current[docKey] = {
            ...latest,
            loading: false,
          };
        }
        endMovementsLoading();
      }

      rebuildEntriesFromV2Cache(docKey, targetAccountKey);
    },
    [
      rebuildEntriesFromV2Cache,
      beginMovementsLoading,
      endMovementsLoading,
      resolveActiveMovementsQuery,
      pageSize,
      currentDailyKey,
      todayKey,
      fromFilter,
      toFilter,
    ]
  );

  useEffect(() => {
    localStorage.setItem("fondogeneral-sortAsc", JSON.stringify(sortAsc));
  }, [sortAsc]);

  // Calendar / day-filtering states (Desde / Hasta)
  const [calendarFromOpen, setCalendarFromOpen] = useState(false);
  const [calendarToOpen, setCalendarToOpen] = useState(false);
  const [calendarFromMonth, setCalendarFromMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [calendarToMonth, setCalendarToMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Advanced filters
  const [filterProviderCode, setFilterProviderCode] = useState<string | "all">(
    () => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("fondogeneral-filterProviderCode");
        return saved !== null ? saved : "all";
      }
      return "all";
    }
  );
  const [providerFilter, setProviderFilter] = useState("");
  const [isProviderDropdownOpen, setIsProviderDropdownOpen] = useState(false);
  const initialFilterPaymentType: FondoEntry["paymentType"] | "all" =
    mode === "all"
      ? "all"
      : mode === "ingreso"
        ? FONDO_INGRESO_TYPES[0]
        : FONDO_EGRESO_TYPES[0];
  const [filterPaymentType, setFilterPaymentType] = useState<
    FondoEntry["paymentType"] | "all"
  >(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fondogeneral-filterPaymentType");
      return saved !== null
        ? (saved as FondoEntry["paymentType"] | "all")
        : initialFilterPaymentType;
    }
    return initialFilterPaymentType;
  });
  const [typeFilter, setTypeFilter] = useState("");
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [filterEditedOnly, setFilterEditedOnly] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fondogeneral-filterEditedOnly");
      return saved !== null ? JSON.parse(saved) : false;
    }
    return false;
  });
  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fondogeneral-searchQuery");
      return saved !== null ? saved : "";
    }
    return "";
  });
  const [rememberFilters, setRememberFilters] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fondogeneral-rememberFilters");
      return saved !== null ? JSON.parse(saved) : false;
    }
    return false;
  });
  const [keepFiltersAcrossCompanies, setKeepFiltersAcrossCompanies] = useState(
    () => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem(
          "fondogeneral-keepFiltersAcrossCompanies"
        );
        return saved !== null ? JSON.parse(saved) : false;
      }
      return false;
    }
  );

  // Column widths for resizable columns (simple px based)
  const [columnWidths, setColumnWidths] = useState<Record<string, string>>({
    hora: "140px",
    motivo: "260px",
    tipo: "160px",
    factura: "90px",
    monto: "180px",
    encargado: "140px",
    editar: "120px",
  });
  const resizingRef = React.useRef<{
    key: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  // refs to detect outside clicks for the from/to calendar popovers
  const fromCalendarRef = React.useRef<HTMLDivElement | null>(null);
  const toCalendarRef = React.useRef<HTMLDivElement | null>(null);
  const fromButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const toButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const startResizing = (event: React.MouseEvent, key: string) => {
    event.preventDefault();
    const startWidth = parseInt(columnWidths[key] || "100", 10) || 100;
    resizingRef.current = { key, startX: event.clientX, startWidth };
  };

  // Cargar tipos de movimientos de fondo desde la base de datos (con caché y sincronización en tiempo real)
  useEffect(() => {
    let isMounted = true;

    // Función para cargar y actualizar tipos
    const loadTypes = async () => {
      try {
        const types =
          await FondoMovementTypesService.getMovementTypesByCategoriesWithCache();

        if (!isMounted) return;

        setIngresoTypes(types.INGRESO);
        setGastoTypes(types.GASTO);
        setEgresoTypes(types.EGRESO);
        setFondoTypesLoaded(true);

        // Actualizar las variables globales para compatibilidad
        FONDO_INGRESO_TYPES = types.INGRESO;
        FONDO_GASTO_TYPES = types.GASTO;
        FONDO_EGRESO_TYPES = types.EGRESO;
        FONDO_TYPE_OPTIONS = [
          ...types.INGRESO,
          ...types.GASTO,
          ...types.EGRESO,
        ];

        // Actualizar los tipos de ajuste automático
        AUTO_ADJUSTMENT_MOVEMENT_TYPE_EGRESO =
          types.GASTO.find((t) => t.toUpperCase() === "GASTOS VARIOS") ??
          types.GASTO[types.GASTO.length - 1] ??
          "";
        AUTO_ADJUSTMENT_MOVEMENT_TYPE_INGRESO =
          types.INGRESO.find((t) => t.toUpperCase() === "OTROS INGRESOS") ??
          types.INGRESO[types.INGRESO.length - 1] ??
          "";

        console.log("[FondoTypes] Loaded:", types);
      } catch (err) {
        console.error("Error loading fondo movement types:", err);
        if (isMounted) {
          setFondoTypesLoaded(true);
        }
      }
    };

    // Listener para actualizaciones en tiempo real desde el caché
    const handleFondoTypesUpdate = (_event: Event) => {
      void _event;
      if (!isMounted) return;

      console.log("[FondoTypes] Cache updated, reloading types...");

      // Recargar tipos cuando el caché se actualiza
      loadTypes();
    };

    // Cargar tipos iniciales (desde caché o DB)
    loadTypes();

    // Escuchar actualizaciones en tiempo real
    window.addEventListener(
      "fondoMovementTypesUpdated",
      handleFondoTypesUpdate
    );

    return () => {
      isMounted = false;
      window.removeEventListener(
        "fondoMovementTypesUpdated",
        handleFondoTypesUpdate
      );
    };
  }, []);

  // Sincronizar filtro de proveedor con selección
  useEffect(() => {
    if (filterProviderCode === "all") {
      setProviderFilter("");
    } else {
      const option = providers.find((p) => p.code === filterProviderCode);
      setProviderFilter(
        option ? `${option.name} (${option.code})` : filterProviderCode
      );
    }
  }, [filterProviderCode, providers]);

  // Sincronizar filtro de tipo con selección
  useEffect(() => {
    if (filterPaymentType === "all") {
      setTypeFilter("");
    } else {
      setTypeFilter(formatMovementType(filterPaymentType));
    }
  }, [filterPaymentType]);

  // Save rememberFilters. If disabled, clear saved filters from storage.
  useEffect(() => {
    localStorage.setItem(
      "fondogeneral-rememberFilters",
      JSON.stringify(rememberFilters)
    );
    if (!rememberFilters && typeof window !== "undefined") {
      try {
        const keysToClear = [
          "fondogeneral-fromFilter",
          "fondogeneral-toFilter",
          "fondogeneral-filterProviderCode",
          "fondogeneral-filterPaymentType",
          "fondogeneral-filterEditedOnly",
          "fondogeneral-searchQuery",
          "fondogeneral-pageSize",
        ];
        for (const k of keysToClear) localStorage.removeItem(k);
      } catch {
        // ignore storage errors
      }
    }
  }, [rememberFilters]);

  // Save keepFiltersAcrossCompanies preference
  useEffect(() => {
    localStorage.setItem(
      "fondogeneral-keepFiltersAcrossCompanies",
      JSON.stringify(keepFiltersAcrossCompanies)
    );
  }, [keepFiltersAcrossCompanies]);

  // Save filters if rememberFilters is true
  useEffect(() => {
    if (rememberFilters) {
      localStorage.setItem("fondogeneral-fromFilter", fromFilter || "");
      localStorage.setItem("fondogeneral-toFilter", toFilter || "");
      localStorage.setItem(
        "fondogeneral-filterProviderCode",
        filterProviderCode
      );
      localStorage.setItem("fondogeneral-filterPaymentType", filterPaymentType);
      localStorage.setItem(
        "fondogeneral-filterEditedOnly",
        JSON.stringify(filterEditedOnly)
      );
      localStorage.setItem("fondogeneral-searchQuery", searchQuery);
      localStorage.setItem("fondogeneral-pageSize", String(pageSize));
    }
  }, [
    rememberFilters,
    fromFilter,
    toFilter,
    filterProviderCode,
    filterPaymentType,
    filterEditedOnly,
    searchQuery,
    pageSize,
  ]);

  // When rememberFilters is enabled, load pageSize from storage (if present)
  useEffect(() => {
    if (!rememberFilters) return;
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("fondogeneral-pageSize");
    if (saved === null) return;
    if (saved === "daily" || saved === "all") {
      setPageSize(saved as any);
      return;
    }
    const n = Number.parseInt(saved, 10);
    if (!Number.isNaN(n) && n > 0) setPageSize(n);
  }, [rememberFilters]);

  useEffect(() => {
    setCurrencyEnabled({ CRC: true, USD: true });
    setMovementCurrency("CRC");
    setInitialAmount("0");
    setInitialAmountUSD("0");
    storageSnapshotRef.current = null;
  }, [company, accountKey]);

  useEffect(() => {
    if (currencyEnabled[movementCurrency]) return;
    if (currencyEnabled.CRC) {
      setMovementCurrency("CRC");
      return;
    }
    if (currencyEnabled.USD) {
      setMovementCurrency("USD");
    }
  }, [currencyEnabled, movementCurrency]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const delta = e.clientX - r.startX;
      const newW = Math.max(40, r.startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [r.key]: `${newW}px` }));
    };
    const onUp = () => {
      resizingRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [columnWidths]);

  // Close calendars when clicking outside them (but don't close when clicking the toggle buttons)
  useEffect(() => {
    if (!calendarFromOpen && !calendarToOpen) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (calendarFromOpen) {
        if (
          fromCalendarRef.current &&
          target &&
          fromCalendarRef.current.contains(target)
        )
          return;
        if (
          fromButtonRef.current &&
          target &&
          fromButtonRef.current.contains(target)
        )
          return;
        setCalendarFromOpen(false);
      }
      if (calendarToOpen) {
        if (
          toCalendarRef.current &&
          target &&
          toCalendarRef.current.contains(target)
        )
          return;
        if (
          toButtonRef.current &&
          target &&
          toButtonRef.current.contains(target)
        )
          return;
        setCalendarToOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [calendarFromOpen, calendarToOpen]);

  const isIngreso = isIngresoType(paymentType);
  const isEgreso = isEgresoType(paymentType) || isGastoType(paymentType);

  const employeeOptions = useMemo(() => {
    const employees = companyEmployees.filter(
      (name) => !!name && name.trim().length > 0
    );

    // Si el usuario actual es admin, agregarlo a la lista de empleados
    if (user?.role === "admin" && user?.name) {
      const adminName = user.name.trim();
      if (!employees.includes(adminName)) {
        return [adminName, ...employees];
      }
    }

    return employees;
  }, [companyEmployees, user]);

  const editingEntry = useMemo(
    () =>
      editingEntryId
        ? fondoEntries.find((entry) => entry.id === editingEntryId) ?? null
        : null,
    [editingEntryId, fondoEntries]
  );
  const editingProviderCode = editingEntry?.providerCode ?? null;

  useEffect(() => {
    const normalizedCompany = (company || "").trim();
    const normalizedCompanyLower = normalizedCompany.toLowerCase();

    // NO cargar movimientos si los tipos aún no están listos
    if (normalizedCompany.length === 0 || FONDO_TYPE_OPTIONS.length === 0) {
      setEntriesHydrated(false);
      setHydratedCompany("");
      setFondoEntries([]);
      storageSnapshotRef.current = null;
      return;
    }

    setEntriesHydrated(false);
    setHydratedCompany("");
    setFondoEntries([]);
    storageSnapshotRef.current = null;
    let isMounted = true;

    const matchesSelectedCompany = (
      storage?: MovementStorage<FondoEntry> | null
    ) => {
      if (!storage) return false;
      const storedCompany = (storage.company || "").trim();
      if (storedCompany.length === 0) return true;
      return storedCompany.toLowerCase() === normalizedCompanyLower;
    };

    const loadEntries = async () => {
      beginMovementsLoading();
      try {
        const legacyOwnerKey = resolvedOwnerId
          ? MovimientosFondosService.buildLegacyOwnerMovementsKey(
            resolvedOwnerId
          )
          : null;
        const parseTime = (value: string) => {
          const timestamp = Date.parse(value);
          return Number.isNaN(timestamp) ? 0 : timestamp;
        };

        type StorageEntriesResult = {
          entries: FondoEntry[];
          storage: MovementStorage<FondoEntry>;
        };

        const buildEntriesFromStorage = (
          rawStorage: unknown,
          movementsOverride?: unknown[] | null,
          targetAccountKey: MovementAccountKey = accountKeyRef.current
        ): StorageEntriesResult | null => {
          if (!rawStorage) return null;
          try {
            const storage =
              MovimientosFondosService.ensureMovementStorageShape<FondoEntry>(
                rawStorage,
                normalizedCompany
              );
            const movements = Array.isArray(movementsOverride)
              ? (movementsOverride as unknown[])
              : storage.operations?.movements ?? [];
            const scopedEntries = movements.filter((rawEntry) => {
              const candidate = rawEntry as Partial<FondoEntry>;
              const movementAccount = isMovementAccountKey(candidate.accountId)
                ? candidate.accountId
                : targetAccountKey;
              return movementAccount === targetAccountKey;
            });
            const entries = sanitizeFondoEntries(
              scopedEntries,
              undefined,
              targetAccountKey
            ).sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt));
            return { entries, storage };
          } catch (err) {
            console.error("Error parsing stored fondo entries:", err);
            return null;
          }
        };

        const buildEntriesFromRaw = (
          rawData: string | null
        ): StorageEntriesResult | null => {
          if (!rawData) return null;
          try {
            const parsed = JSON.parse(rawData);
            return buildEntriesFromStorage(parsed);
          } catch (err) {
            console.error("Error parsing stored fondo entries:", err);
            return null;
          }
        };

        const loadRemoteEntries = async (
          docKey: string
        ): Promise<{
          result: StorageEntriesResult | null;
          status: "success" | "not-found" | "error";
        }> => {
          if (!docKey) return { result: null, status: "error" };
          try {
            const remoteStorage =
              await MovimientosFondosService.getDocument<FondoEntry>(docKey);
            if (!remoteStorage) {
              return { result: null, status: "not-found" };
            }

            // Prefer V2 movements subcollection to avoid document overwrites/truncation.
            let v2Movements: FondoEntry[] = [];
            try {
              const cached = v2MovementsCacheRef.current[docKey];
              if (cached?.loaded) {
                v2Movements = Array.isArray(cached.movements)
                  ? cached.movements
                  : [];
              } else {
                // Default remote load: only the active day/range (today unless both Desde/Hasta are set).
                await ensureV2MovementsLoaded(docKey);
                const next = v2MovementsCacheRef.current[docKey];
                v2Movements = Array.isArray(next?.movements)
                  ? (next!.movements as FondoEntry[])
                  : [];
              }
            } catch (listErr) {
              console.error(
                `[FG-V2] Error listing v2 movements (${docKey}):`,
                listErr
              );
            }

            // One-time migration: if v2 is empty but legacy array has movements.
            try {
              const legacyMovements = (remoteStorage.operations?.movements ??
                []) as FondoEntry[];
              if (
                v2Movements.length === 0 &&
                Array.isArray(legacyMovements) &&
                legacyMovements.length > 0
              ) {
                const hasAny = await MovimientosFondosService.hasAnyV2Movements(
                  docKey
                );
                if (!hasAny) {
                  console.warn(
                    `[FG-V2] Migrating legacy movements to v2 (${docKey})`,
                    { legacyCount: legacyMovements.length }
                  );
                  const { migrated } =
                    await MovimientosFondosService.migrateLegacyMovementsToV2<FondoEntry>(
                      docKey,
                      legacyMovements
                    );
                  console.warn(`[FG-V2] Migration completed (${docKey})`, {
                    migrated,
                  });

                  // Clear legacy movements from main document to prevent future truncation/overwrites.
                  const cleaned =
                    MovimientosFondosService.ensureMovementStorageShape<FondoEntry>(
                      remoteStorage,
                      normalizedCompany
                    );
                  cleaned.operations = { movements: [] };
                  await MovimientosFondosService.saveDocument(docKey, cleaned);

                  // After migration, load only the active day/range.
                  await ensureV2MovementsLoaded(docKey);
                  const next = v2MovementsCacheRef.current[docKey];
                  v2Movements = Array.isArray(next?.movements)
                    ? (next!.movements as FondoEntry[])
                    : [];
                }
              }
            } catch (migrateErr) {
              console.error(
                `[FG-V2] Error migrating legacy movements (${docKey}):`,
                migrateErr
              );
            }

            return {
              result: buildEntriesFromStorage(
                remoteStorage,
                v2Movements,
                accountKeyRef.current
              ),
              status: "success",
            };
          } catch (err) {
            console.error(
              `Error reading fondo entries from Firestore (${docKey}):`,
              err
            );
            return { result: null, status: "error" };
          }
        };

        const companyKey =
          MovimientosFondosService.buildCompanyMovementsKey(normalizedCompany);
        let resolvedEntries: FondoEntry[] | null = null;
        let resolvedState: MovementStorageState | null = null;
        let hasResolvedSource = false;
        let remoteConfirmedNotFound = false;
        let remoteAnyError = false;

        const assignResult = (result: StorageEntriesResult | null) => {
          if (!result) return false;
          if (!matchesSelectedCompany(result.storage)) return false;
          resolvedEntries = result.entries;
          resolvedState = result.storage?.state ?? null;
          // Keep snapshot lean: movements are stored in v2 subcollection.
          storageSnapshotRef.current = {
            ...result.storage,
            operations: { movements: [] },
          };
          hasResolvedSource = true;
          return true;
        };

        const tryRemoteKey = async (docKey: string | null) => {
          if (!docKey || hasResolvedSource) return;
          const { result, status } = await loadRemoteEntries(docKey);
          if (status === "error") {
            remoteAnyError = true;
            return;
          }
          if (status === "not-found") {
            remoteConfirmedNotFound = true;
            return;
          }
          if (status === "success" && result) {
            assignResult(result);
          }
        };

        await tryRemoteKey(companyKey);

        if (
          !hasResolvedSource &&
          legacyOwnerKey &&
          legacyOwnerKey !== companyKey
        ) {
          await tryRemoteKey(legacyOwnerKey);
        }

        if (!hasResolvedSource && remoteConfirmedNotFound && !remoteAnyError) {
          const emptyStorage =
            MovimientosFondosService.createEmptyMovementStorage<FondoEntry>(
              normalizedCompany
            );
          storageSnapshotRef.current = emptyStorage;
          resolvedEntries = [];
          resolvedState = emptyStorage.state;
          hasResolvedSource = true;
          localStorage.removeItem(companyKey);
          if (legacyOwnerKey && legacyOwnerKey !== companyKey) {
            localStorage.removeItem(legacyOwnerKey);
          }
          const legacyKey = buildStorageKey(namespace, FONDO_KEY_SUFFIX);
          localStorage.removeItem(legacyKey);
        }

        if (!hasResolvedSource) {
          assignResult(buildEntriesFromRaw(localStorage.getItem(companyKey)));
        }

        if (
          !hasResolvedSource &&
          legacyOwnerKey &&
          legacyOwnerKey !== companyKey
        ) {
          assignResult(
            buildEntriesFromRaw(localStorage.getItem(legacyOwnerKey))
          );
        }

        if (!hasResolvedSource) {
          const legacyKey = buildStorageKey(namespace, FONDO_KEY_SUFFIX);
          const legacyRaw = localStorage.getItem(legacyKey);
          if (legacyRaw) {
            try {
              const legacyParsed = JSON.parse(legacyRaw);
              const parsedEntries = sanitizeFondoEntries(
                legacyParsed,
                undefined,
                accountKeyRef.current
              );
              if (parsedEntries.length > 0) {
                resolvedEntries = parsedEntries;
                const fallbackStorage =
                  MovimientosFondosService.createEmptyMovementStorage<FondoEntry>(
                    normalizedCompany
                  );
                fallbackStorage.operations.movements = parsedEntries.map(
                  (entry) => ({
                    ...entry,
                    accountId: accountKeyRef.current,
                  })
                );
                storageSnapshotRef.current = fallbackStorage;
              }
            } catch (err) {
              console.error("Error parsing legacy fondo entries:", err);
            }
          }
        }

        if (isMounted) {
          setFondoEntries(resolvedEntries ?? []);
          if (resolvedState) {
            applyLedgerStateFromStorage(resolvedState);
          }
        }
      } catch (err) {
        console.error("Error reading fondo entries:", err);
        if (isMounted) {
          setFondoEntries([]);
        }
      } finally {
        if (isMounted) {
          setHydratedCompany(normalizedCompany);
          setHydratedAccountKey(accountKeyRef.current);
          setEntriesHydrated(true);
          endMovementsLoading();
        }
      }
    };

    void loadEntries();

    return () => {
      isMounted = false;
    };
  }, [namespace, resolvedOwnerId, company, applyLedgerStateFromStorage, beginMovementsLoading, endMovementsLoading]);

  // When switching tabs, do not reload from Firestore: just filter cached v2 movements in-memory.
  useEffect(() => {
    if (!entriesHydrated) return;
    const docKey = resolveV2DocKey();
    if (!docKey) return;
    const cached = v2MovementsCacheRef.current[docKey];
    if (!cached?.loaded) return;

    const scopedEntries = cached.movements.filter((rawEntry) => {
      const candidate = rawEntry as Partial<FondoEntry>;
      const movementAccount = isMovementAccountKey(candidate.accountId)
        ? candidate.accountId
        : accountKey;
      return movementAccount === accountKey;
    });

    const entries = sanitizeFondoEntries(
      scopedEntries,
      undefined,
      accountKey
    ).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setFondoEntries(entries);

    const state = storageSnapshotRef.current?.state;
    if (state) {
      applyLedgerStateFromStorage(state);
    }

    setHydratedAccountKey(accountKey);
  }, [
    accountKey,
    entriesHydrated,
    applyLedgerStateFromStorage,
    resolveV2DocKey,
  ]);

  // On-demand v2 loading: keep Firestore reads constrained to the active day/range.
  useEffect(() => {
    if (!entriesHydrated) return;
    const docKey = resolveV2DocKey();
    if (!docKey) return;

    // Only query the remote range when BOTH Desde/Hasta are set.
    if ((fromFilter && !toFilter) || (!fromFilter && toFilter)) return;

    void ensureV2MovementsLoaded(docKey);
  }, [
    entriesHydrated,
    pageSize,
    fromFilter,
    toFilter,
    currentDailyKey,
    resolveV2DocKey,
    ensureV2MovementsLoaded,
  ]);

  useEffect(() => {
    if (
      !entriesHydrated ||
      providers.length === 0 ||
      fondoEntries.length === 0
    ) {
      return;
    }

    const sortedEntries = [...fondoEntries].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    let hasPendingCierreDeCaja = false;
    for (const entry of sortedEntries) {
      // Si encontramos un CIERRE DE FONDO GENERAL, no hay pendiente
      if (isAutoAdjustmentProvider(entry.providerCode)) {
        break;
      }
      // Buscar el nombre del proveedor por su código
      const providerData = providers.find((p) => p.code === entry.providerCode);
      if (
        providerData?.name?.toUpperCase() === CIERRE_FONDO_VENTAS_PROVIDER_NAME
      ) {
        hasPendingCierreDeCaja = true;
        break;
      }
    }
    setPendingCierreDeCaja(hasPendingCierreDeCaja);
    console.log(
      "[CIERRE-DEBUG] Estado pendingCierreDeCaja después de cargar:",
      hasPendingCierreDeCaja
    );
  }, [entriesHydrated, providers, fondoEntries]);

  useEffect(() => {
    if (!selectedProvider) return;
    const exists = providers.some((p) => p.code === selectedProvider);
    const isEditingSameProvider =
      editingEntryId && editingProviderCode === selectedProvider;
    if (!exists && !isEditingSameProvider) {
      setSelectedProvider("");
    }
  }, [providers, selectedProvider, editingEntryId, editingProviderCode]);

  useEffect(() => {
    loadedDailyClosingKeysRef.current = new Set();
    loadingDailyClosingKeysRef.current = new Set();
    dailyClosingsRequestCountRef.current = 0;
    setDailyClosingsRefreshing(false);
    setDailyClosingsHydrated(false);
    setDailyClosings([]);

    if (accountKey !== "FondoGeneral") {
      setDailyClosingsHydrated(true);
      return;
    }

    const normalizedCompany = (company || "").trim();
    if (normalizedCompany.length === 0) {
      setDailyClosingsHydrated(true);
      return;
    }

    let isActive = true;
    beginDailyClosingsRequest();

    const loadClosings = async () => {
      try {
        const document = await DailyClosingsService.getDocument(
          normalizedCompany
        );
        if (!isActive) return;
        if (document) {
          const { records, loadedKeys } =
            flattenDailyClosingsDocument(document);
          setDailyClosings(records);
          loadedDailyClosingKeysRef.current = loadedKeys;
          return;
        }

        if (!closingsStorageKey) {
          setDailyClosings([]);
          return;
        }

        const stored = localStorage.getItem(closingsStorageKey);
        if (!stored) {
          setDailyClosings([]);
          return;
        }
        const parsed = JSON.parse(stored) as unknown;
        setDailyClosings(sanitizeDailyClosings(parsed));
      } catch (err) {
        console.error("Error reading daily closings from Firestore:", err);
        if (!isActive) return;

        if (closingsStorageKey) {
          try {
            const stored = localStorage.getItem(closingsStorageKey);
            if (stored) {
              const parsed = JSON.parse(stored) as unknown;
              setDailyClosings(sanitizeDailyClosings(parsed));
              return;
            }
          } catch (storageErr) {
            console.error("Error reading stored daily closings:", storageErr);
          }
        }
        setDailyClosings([]);
      } finally {
        if (isActive) {
          setDailyClosingsHydrated(true);
        }
        finishDailyClosingsRequest();
      }
    };

    void loadClosings();

    return () => {
      isActive = false;
    };
  }, [
    company,
    accountKey,
    closingsStorageKey,
    beginDailyClosingsRequest,
    finishDailyClosingsRequest,
  ]);

  useEffect(() => {
    if (
      !dailyClosingsHydrated ||
      !closingsStorageKey ||
      accountKey !== "FondoGeneral"
    )
      return;
    try {
      localStorage.setItem(closingsStorageKey, JSON.stringify(dailyClosings));
    } catch (err) {
      console.error("Error storing daily closings:", err);
    }
  }, [closingsStorageKey, dailyClosings, accountKey, dailyClosingsHydrated]);

  useEffect(() => {
    if (accountKey !== "FondoGeneral") return;
    if (!dailyClosingsHydrated) return;
    const normalizedCompany = (company || "").trim();
    if (normalizedCompany.length === 0) return;
    const targetKey = currentDailyKey;
    if (!targetKey) return;
    if (loadedDailyClosingKeysRef.current.has(targetKey)) return;
    if (loadingDailyClosingKeysRef.current.has(targetKey)) return;

    let isActive = true;
    let shouldMarkLoaded = false;
    loadingDailyClosingKeysRef.current.add(targetKey);
    beginDailyClosingsRequest();

    const loadByDay = async () => {
      try {
        const records = await DailyClosingsService.getClosingsForDate(
          normalizedCompany,
          targetKey
        );
        if (!isActive) return;
        if (records.length > 0) {
          setDailyClosings((prev) => mergeDailyClosingRecords(prev, records));
        }
        shouldMarkLoaded = true;
      } catch (err) {
        console.error("Error loading daily closings for selected day:", err);
      } finally {
        loadingDailyClosingKeysRef.current.delete(targetKey);
        if (isActive && shouldMarkLoaded) {
          loadedDailyClosingKeysRef.current.add(targetKey);
        }
        finishDailyClosingsRequest();
      }
    };

    void loadByDay();

    return () => {
      isActive = false;
    };
  }, [
    accountKey,
    company,
    currentDailyKey,
    dailyClosingsHydrated,
    beginDailyClosingsRequest,
    finishDailyClosingsRequest,
  ]);

  useEffect(() => {
    let isActive = true;
    setCompanyEmployees([]);

    if (!company) {
      setEmployeesLoading(false);
      return () => {
        isActive = false;
      };
    }

    // Solo cargar empleados de la empresa si estamos en fondogeneral (namespace 'fg')
    // Para otros fondos (BCR, BN, BAC), no cargar empleados
    if (namespace !== "fg") {
      setEmployeesLoading(false);
      return () => {
        isActive = false;
      };
    }

    setEmployeesLoading(true);
    EmpresasService.getAllEmpresas()
      .then((empresas) => {
        if (!isActive) return;
        const match = empresas.find(
          (emp) => emp.name?.toLowerCase() === company.toLowerCase()
        );
        const names =
          match?.empleados?.map((emp) => emp.Empleado).filter(Boolean) ?? [];
        setCompanyEmployees(names as string[]);
      })
      .catch((err) => {
        console.error("Error loading company employees:", err);
        if (isActive) setCompanyEmployees([]);
      })
      .finally(() => {
        if (isActive) setEmployeesLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [company, namespace]);

  // Load company data to check ownerId for delete permissions
  useEffect(() => {
    let isActive = true;
    setCompanyData(null);

    if (!company) {
      return () => {
        isActive = false;
      };
    }

    EmpresasService.getAllEmpresas()
      .then((empresas) => {
        if (!isActive) return;
        const match = empresas.find(
          (emp) => emp.name?.toLowerCase() === company.toLowerCase()
        );
        if (match) {
          setCompanyData(match);
        }
      })
      .catch((err) => {
        console.error("Error loading company data:", err);
        if (isActive) setCompanyData(null);
      });

    return () => {
      isActive = false;
    };
  }, [company]);

  useEffect(() => {
    if (manager && !employeeOptions.includes(manager)) {
      setManager("");
    }
  }, [manager, employeeOptions]);

  useEffect(() => {
    if (isIngreso) {
      setEgreso("");
    } else {
      setIngreso("");
    }
  }, [paymentType, isIngreso]);

  const resetFondoForm = useCallback(() => {
    setSelectedProvider("");
    setInvoiceNumber("");
    setEgreso("");
    setIngreso("");
    setManager("");
    setPaymentType("COMPRA INVENTARIO");
    setNotes("");
    setEditingEntryId(null);
    // Clear all validation errors
    setProviderError("");
    setInvoiceError("");
    setAmountError("");
    setManagerError("");
  }, []);

  const normalizeMoneyInput = (value: string) => value.replace(/[^0-9]/g, "");

  /**
   * Envía un correo de notificación cuando se crea o edita un movimiento,
   * solo si el proveedor tiene configurado un correo de notificación.
   */
  const sendMovementNotification = useCallback(
    async (
      entry: FondoEntry,
      operationType: "create" | "edit"
    ): Promise<void> => {
      try {
        // Buscar el proveedor para obtener su correonotifi
        const provider = providers.find((p) => p.code === entry.providerCode);

        // Si el proveedor no tiene correonotifi, no enviar correo
        if (
          !provider?.correonotifi ||
          provider.correonotifi.trim().length === 0
        ) {
          return;
        }

        // Obtener el nombre del proveedor
        const providerName = provider.name || entry.providerCode;

        // Calcular el monto y tipo
        const amount =
          entry.amountEgreso > 0 ? entry.amountEgreso : entry.amountIngreso;
        const amountType: "Egreso" | "Ingreso" =
          entry.amountEgreso > 0 ? "Egreso" : "Ingreso";
        const currency = (entry.currency as "CRC" | "USD") || "CRC";

        // Generar el contenido del correo usando la plantilla
        const emailContent = generateMovementNotificationEmail({
          company: company || "",
          providerName,
          providerCode: entry.providerCode,
          paymentType: entry.paymentType,
          invoiceNumber: entry.invoiceNumber,
          amount,
          amountType,
          currency,
          manager: entry.manager,
          notes: entry.notes,
          createdAt: entry.createdAt,
          operationType,
        });

        // Crear documento en la colección 'mail' para que la extensión Firebase Trigger Email lo procese
        try {
          const docRef = await addDoc(collection(db, "mail"), {
            to: provider.correonotifi,
            subject: emailContent.subject,
            text: emailContent.text,
            html: emailContent.html,
            createdAt: serverTimestamp(),
          });
          console.log(
            `[MAIL-DOC] Documento creado en 'mail' para movimiento: ${docRef.id}`
          );
          showToast("Correo de notificación enviado correctamente", "success");
        } catch (err) {
          console.error(
            '[MAIL-DOC] Error creando documento en "mail" para movimiento:',
            err
          );
          showToast("Error al enviar correo de notificación", "error");
        }
      } catch (err) {
        console.error(
          "[EMAIL-NOTIFICATION] Error preparing notification:",
          err
        );
        // No lanzar error, la notificación es secundaria
      }
    },
    [company, providers, showToast]
  );

  /**
   * Función auxiliar para persistir movimientos a Firestore de forma inmediata.
   * Retorna true si se guardó correctamente, false si hubo error.
   */
  const persistMovementToFirestore = useCallback(
    async (
      updatedEntries: FondoEntry[],
      operationType: "create" | "edit" | "delete",
      change?: {
        upsert?: FondoEntry;
        deleteId?: string;
        before?: FondoEntry | null;
      }
    ): Promise<{ ok: boolean; confirmed: boolean }> => {
      const normalizedCompany = (company || "").trim();
      if (normalizedCompany.length === 0) {
        console.error("[PERSIST-IMMEDIATE] No company specified");
        return { ok: false, confirmed: false };
      }

      const companyKey =
        MovimientosFondosService.buildCompanyMovementsKey(normalizedCompany);

      try {
        const baseStorage = storageSnapshotRef.current
          ? MovimientosFondosService.ensureMovementStorageShape<FondoEntry>(
            storageSnapshotRef.current,
            normalizedCompany
          )
          : MovimientosFondosService.createEmptyMovementStorage<FondoEntry>(
            normalizedCompany
          );

        baseStorage.company = normalizedCompany;

        // V2: movements live in a subcollection. Never persist the array to the main document.
        baseStorage.operations = { movements: [] };

        // IMPORTANTE:
        // Con filtros de rango (Desde/Hasta) en v2, `updatedEntries` puede NO contener
        // todos los movimientos históricos. Por eso NO podemos recalcular currentBalance
        // sumando `updatedEntries`. En su lugar, actualizamos balances por delta:
        // - create: + (ingreso-egreso)
        // - delete: - (ingreso-egreso)
        // - edit:   + (after - before)

        const parseBalance = (value: unknown) => {
          const parsed = typeof value === "number" ? value : Number(value);
          return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
        };

        const normalizeCurrency = (value: unknown): MovementCurrencyKey =>
          value === "USD" ? "USD" : "CRC";

        const movementDelta = (
          entry: Partial<FondoEntry> | null | undefined
        ): { currency: MovementCurrencyKey; delta: number } | null => {
          if (!entry) return null;
          const currency = normalizeCurrency(entry.currency);
          const ingreso = parseBalance((entry as any).amountIngreso ?? 0);
          const egreso = parseBalance((entry as any).amountEgreso ?? 0);
          return { currency, delta: ingreso - egreso };
        };

        const normalizedInitialCRC =
          initialAmount.trim().length > 0 ? initialAmount.trim() : "0";
        const normalizedInitialUSD =
          initialAmountUSD.trim().length > 0 ? initialAmountUSD.trim() : "0";
        const parsedInitialCRC = Number(normalizedInitialCRC) || 0;
        const parsedInitialUSD = Number(normalizedInitialUSD) || 0;

        const stateSnapshot =
          baseStorage.state ??
          MovimientosFondosService.createEmptyMovementStorage<FondoEntry>(
            normalizedCompany
          ).state;

        const existingCRC = stateSnapshot.balancesByAccount.find(
          (balance) =>
            balance.accountId === accountKey && balance.currency === "CRC"
        );
        const existingUSD = stateSnapshot.balancesByAccount.find(
          (balance) =>
            balance.accountId === accountKey && balance.currency === "USD"
        );

        const prevInitialCRC = existingCRC
          ? parseBalance(existingCRC.initialBalance ?? 0)
          : parseBalance(ledgerSnapshot.initialCRC);
        const prevInitialUSD = existingUSD
          ? parseBalance(existingUSD.initialBalance ?? 0)
          : parseBalance(ledgerSnapshot.initialUSD);
        const prevCurrentCRC = existingCRC
          ? parseBalance(existingCRC.currentBalance ?? prevInitialCRC)
          : parseBalance(ledgerSnapshot.currentCRC);
        const prevCurrentUSD = existingUSD
          ? parseBalance(existingUSD.currentBalance ?? prevInitialUSD)
          : parseBalance(ledgerSnapshot.currentUSD);

        const deltas: Record<MovementCurrencyKey, number> = { CRC: 0, USD: 0 };

        const resolveBeforeFallback = (): FondoEntry | null => {
          const targetId =
            operationType === "delete"
              ? change?.deleteId
              : operationType === "edit"
                ? change?.upsert?.id
                : null;
          if (!targetId) return null;
          const cached = v2MovementsCacheRef.current[companyKey];
          return cached?.movements?.find((m) => m.id === targetId) ?? null;
        };

        const beforeEntry = change?.before ?? resolveBeforeFallback();
        const afterEntry = change?.upsert;

        if (operationType === "create") {
          const d = movementDelta(afterEntry);
          if (d) deltas[d.currency] += d.delta;
        } else if (operationType === "delete") {
          const d = movementDelta(beforeEntry);
          if (d) deltas[d.currency] -= d.delta;
        } else if (operationType === "edit") {
          const before = movementDelta(beforeEntry);
          if (before) deltas[before.currency] -= before.delta;
          const after = movementDelta(afterEntry);
          if (after) deltas[after.currency] += after.delta;
        }

        const nextCurrentCRC =
          prevCurrentCRC + (parsedInitialCRC - prevInitialCRC) + deltas.CRC;
        const nextCurrentUSD =
          prevCurrentUSD + (parsedInitialUSD - prevInitialUSD) + deltas.USD;
        const nextAccountBalances = stateSnapshot.balancesByAccount.filter(
          (balance) => balance.accountId !== accountKey
        );
        nextAccountBalances.push(
          {
            accountId: accountKey,
            currency: "CRC",
            enabled: currencyEnabled.CRC,
            initialBalance: parsedInitialCRC,
            currentBalance: nextCurrentCRC,
          },
          {
            accountId: accountKey,
            currency: "USD",
            enabled: currencyEnabled.USD,
            initialBalance: parsedInitialUSD,
            currentBalance: nextCurrentUSD,
          }
        );
        stateSnapshot.balancesByAccount = nextAccountBalances;
        stateSnapshot.updatedAt = new Date().toISOString();

        // Preservar lockedUntil del snapshot actual si existe
        if (storageSnapshotRef.current?.state?.lockedUntil) {
          stateSnapshot.lockedUntil =
            storageSnapshotRef.current.state.lockedUntil;
        }
        baseStorage.state = stateSnapshot;

        // Guardar en localStorage primero (solo snapshot/config/state; los movimientos viven en Firestore v2 cache)
        try {
          localStorage.setItem(companyKey, JSON.stringify(baseStorage));
        } catch (storageError) {
          // El snapshot ahora es pequeño; si falla, solo reportar.
          console.warn(
            "[PERSIST-IMMEDIATE] localStorage write failed:",
            storageError
          );
        }

        // Persist movement change to v2 subcollection
        if (operationType === "delete") {
          const deleteId = change?.deleteId;
          if (!deleteId) {
            throw new Error(
              "[PERSIST-IMMEDIATE] delete requires change.deleteId"
            );
          }
          await MovimientosFondosService.deleteMovement(companyKey, deleteId);

          const cached = v2MovementsCacheRef.current[companyKey];
          if (cached?.loaded) {
            v2MovementsCacheRef.current[companyKey] = {
              ...cached,
              loaded: true,
              movements: cached.movements.filter((m) => m.id !== deleteId),
            };
          }
        } else {
          const movement = change?.upsert;
          if (!movement) {
            throw new Error(
              "[PERSIST-IMMEDIATE] create/edit requires change.upsert"
            );
          }
          const normalizedCurrency: MovementCurrencyKey =
            movement.currency === "USD" ? "USD" : "CRC";
          const storedMovement: FondoEntry = {
            ...(movement as FondoEntry),
            accountId: accountKey,
            currency: normalizedCurrency,
          };
          await MovimientosFondosService.upsertMovement(
            companyKey,
            storedMovement
          );

          const cached = v2MovementsCacheRef.current[companyKey];
          if (cached?.loaded) {
            const next = [
              storedMovement,
              ...cached.movements.filter((m) => m.id !== storedMovement.id),
            ];
            v2MovementsCacheRef.current[companyKey] = {
              ...cached,
              loaded: true,
              movements: next,
            };
          }
        }

        // Guardar en Firestore - ESTA ES LA PARTE CRÍTICA
        console.log(
          `[PERSIST-IMMEDIATE] Guardando ${operationType} a Firestore...`,
          {
            company: normalizedCompany,
            accountKey,
            entriesCount: updatedEntries.length,
          }
        );

        await MovimientosFondosService.saveDocument(companyKey, baseStorage);

        // setDoc puede resolver con escritura local; esperamos un poco por confirmación del backend
        // para evitar casos de "se guardó" cuando el usuario estaba offline/intermitente.
        let confirmed = false;
        try {
          const timeoutMs = 8000;
          await Promise.race([
            waitForPendingWrites(db).then(() => {
              confirmed = true;
            }),
            new Promise<void>((_, reject) => {
              setTimeout(
                () => reject(new Error("waitForPendingWrites timeout")),
                timeoutMs
              );
            }),
          ]);
        } catch (pendingErr) {
          console.warn(
            `[PERSIST-IMMEDIATE] ⚠️ ${operationType} guardado localmente pero sin confirmación del servidor aún`,
            pendingErr
          );
        }

        console.log(
          `[PERSIST-IMMEDIATE] ✅ ${operationType} guardado (confirmed=${confirmed})`
        );

        // Actualizar snapshot después de guardar
        storageSnapshotRef.current = baseStorage;

        // Refrescar snapshot de balances para UI (independiente de filtros)
        setLedgerSnapshot({
          initialCRC: parsedInitialCRC,
          currentCRC: nextCurrentCRC,
          initialUSD: parsedInitialUSD,
          currentUSD: nextCurrentUSD,
        });

        return { ok: true, confirmed };
      } catch (err) {
        console.error(
          `[PERSIST-IMMEDIATE] ❌ Error guardando ${operationType} a Firestore:`,
          err
        );
        return { ok: false, confirmed: false };
      }
    },
    [
      company,
      accountKey,
      initialAmount,
      initialAmountUSD,
      currencyEnabled,
      setLedgerSnapshot,
    ]
  );

  const persistCreatedMovement = useCallback(
    async (entry: FondoEntry, updatedEntries: FondoEntry[]): Promise<void> => {
      // PRIMERO persistir a Firestore, LUEGO actualizar UI
      const saved = await persistMovementToFirestore(updatedEntries, "create", {
        upsert: entry,
      });

      if (!saved.ok) {
        showToast(
          "Error al guardar el movimiento. Por favor, intente de nuevo.",
          "error",
          5000
        );
        editingInProgressRef.current = false;
        return;
      }

      // Limpiar flag de edición en progreso
      editingInProgressRef.current = false;

      // Solo actualizar la UI si el guardado fue exitoso
      setFondoEntries(updatedEntries);
      if (saved.confirmed) {
        showToast("Movimiento guardado correctamente", "success", 3000);
      } else {
        showToast(
          "Movimiento guardado localmente; pendiente de sincronización (revisa tu conexión).",
          "warning",
          6000
        );
      }

      // Enviar notificación por correo si el proveedor tiene correonotifi
      sendMovementNotification(entry, "create").catch((err) => {
        console.error(
          "[NOTIFICATION] Error en notificación de movimiento:",
          err
        );
      });

      const selectedProviderData = providers.find(
        (p) => p.code === entry.providerCode
      );
      if (
        selectedProviderData?.name?.toUpperCase() ===
        CIERRE_FONDO_VENTAS_PROVIDER_NAME
      ) {
        setPendingCierreDeCaja(true);
      }
      resetFondoForm();
      if (!movementAutoCloseLocked) {
        setMovementModalOpen(false);
      }
    },
    [
      persistMovementToFirestore,
      showToast,
      sendMovementNotification,
      providers,
      resetFondoForm,
      movementAutoCloseLocked,
      setFondoEntries,
    ]
  );

  const cancelOpenCreateMovement = useCallback(() => {
    setConfirmOpenCreateMovement(false);
  }, []);

  const handleSubmitFondo = async () => {
    if (!company) return;
    if (isSaving) return; // Prevenir múltiples envíos

    let hasErrors = false;

    if (!selectedProvider) {
      setProviderError("Selecciona un proveedor");
      hasErrors = true;
    } else {
      setProviderError("");
    }

    const providerExists = selectedProviderExists;
    if (
      !providerExists &&
      !(editingEntryId && editingEntry?.providerCode === selectedProvider)
    ) {
      setProviderError("Proveedor no válido");
      hasErrors = true;
    }

    if (!/^[0-9]{1,4}$/.test(invoiceNumber)) {
      setInvoiceError("Ingresa un número de factura válido (1-4 dígitos)");
      hasErrors = true;
    } else {
      setInvoiceError("");
    }

    if (!manager) {
      setManagerError("Selecciona un encargado");
      hasErrors = true;
    } else {
      setManagerError("");
    }

    const egresoValue = isEgreso ? Number.parseInt(egreso, 10) : 0;
    const ingresoValue = isIngreso ? Number.parseInt(ingreso, 10) : 0;
    const trimmedNotes = notes.trim();

    if (isEgreso && (Number.isNaN(egresoValue) || egresoValue <= 0)) {
      setAmountError("Ingresa un monto válido para egreso");
      hasErrors = true;
    } else if (isIngreso && (Number.isNaN(ingresoValue) || ingresoValue <= 0)) {
      setAmountError("Ingresa un monto válido para ingreso");
      hasErrors = true;
    } else {
      setAmountError("");
    }

    if (hasErrors) return;

    if (isEgreso && (Number.isNaN(egresoValue) || egresoValue <= 0)) return;
    if (isIngreso && (Number.isNaN(ingresoValue) || ingresoValue <= 0)) return;

    const paddedInvoice = invoiceNumber.padStart(4, "0");

    setIsSaving(true);

    try {
      if (editingEntryId) {
        // Update the existing entry in-place so balances remain correct.
        const original = fondoEntries.find((e) => e.id === editingEntryId);
        if (!original) {
          setIsSaving(false);
          return;
        }

        const changes: string[] = [];
        if (selectedProvider !== original.providerCode)
          changes.push(
            `Proveedor: ${original.providerCode} → ${selectedProvider}`
          );
        if (paddedInvoice !== original.invoiceNumber)
          changes.push(
            `N° factura: ${original.invoiceNumber} → ${paddedInvoice}`
          );
        if (paymentType !== original.paymentType)
          changes.push(`Tipo: ${original.paymentType} → ${paymentType}`);
        const originalAmount = isEgresoType(original.paymentType)
          ? original.amountEgreso
          : original.amountIngreso;
        const newAmount = isEgreso ? egresoValue : ingresoValue;
        if (Number.isFinite(originalAmount) && originalAmount !== newAmount)
          changes.push(`Monto: ${originalAmount} → ${newAmount}`);
        if (manager !== original.manager)
          changes.push(`Encargado: ${original.manager} → ${manager}`);
        if (trimmedNotes !== (original.notes ?? ""))
          changes.push(`Notas: "${original.notes}" → "${trimmedNotes}"`);

        // Preparar el movimiento editado ANTES de persistir
        let updatedEntry: FondoEntry | null = null;
        const updatedEntries = fondoEntries.map((e) => {
          if (e.id !== editingEntryId) return e;
          // append to existing history if present
          let history: any[] = [];
          try {
            const existing = e.auditDetails
              ? (JSON.parse(e.auditDetails) as any)
              : null;
            if (existing && Array.isArray(existing.history))
              history = existing.history.slice();
            else if (existing && existing.before && existing.after)
              history = [
                {
                  at: existing.at ?? e.createdAt,
                  before: existing.before,
                  after: existing.after,
                },
              ];
          } catch {
            history = [];
          }

          // Validar límite máximo de ediciones
          if (history.length >= MAX_AUDIT_EDITS) {
            showToast(
              `No se pueden realizar más de ${MAX_AUDIT_EDITS} ediciones en un mismo movimiento`,
              "error"
            );
            return e; // No permitir más ediciones
          }

          // Crear registro simplificado con solo los campos que cambiaron
          const changedFields = getChangedFields(
            {
              providerCode: e.providerCode,
              invoiceNumber: e.invoiceNumber,
              paymentType: e.paymentType,
              amountEgreso: e.amountEgreso,
              amountIngreso: e.amountIngreso,
              manager: e.manager,
              notes: e.notes,
              currency: e.currency,
            },
            {
              providerCode: selectedProvider,
              invoiceNumber: paddedInvoice,
              paymentType,
              amountEgreso: isEgreso ? egresoValue : 0,
              amountIngreso: isEgreso ? 0 : ingresoValue,
              manager,
              notes: trimmedNotes,
              currency: movementCurrency,
            }
          );
          const newRecord = { at: new Date().toISOString(), ...changedFields };
          history.push(newRecord);
          // Comprimir historial para evitar QuotaExceededError
          const compressedHistory = compressAuditHistory(history);
          // keep original createdAt so chronological order and balances are preserved
          updatedEntry = {
            ...e,
            providerCode: selectedProvider,
            invoiceNumber: paddedInvoice,
            paymentType,
            amountEgreso: isEgreso ? egresoValue : 0,
            amountIngreso: isEgreso ? 0 : ingresoValue,
            manager,
            notes: trimmedNotes,
            // mark as edited/audited and preserve originalEntryId (point to initial id)
            isAudit: true,
            originalEntryId: e.originalEntryId ?? e.id,
            auditDetails: JSON.stringify({ history: compressedHistory }),
            currency: movementCurrency,
          } as FondoEntry;
          return updatedEntry;
        });

        // PRIMERO persistir a Firestore, LUEGO actualizar UI
        const saved = await persistMovementToFirestore(updatedEntries, "edit", {
          upsert: updatedEntry ?? undefined,
          before: original,
        });

        if (!saved.ok) {
          showToast(
            "Error al guardar el movimiento. Por favor, intente de nuevo.",
            "error",
            5000
          );
          setIsSaving(false);
          editingInProgressRef.current = false;
          return;
        }

        // Registrar timestamp de la última edición guardada
        lastEditSaveTimestampRef.current = Date.now();
        editingInProgressRef.current = false;

        // Solo actualizar la UI si el guardado fue exitoso
        setFondoEntries(updatedEntries);
        if (saved.confirmed) {
          showToast("Movimiento editado correctamente", "success", 3000);
        } else {
          showToast(
            "Edición guardada localmente; pendiente de sincronización (revisa tu conexión).",
            "warning",
            6000
          );
        }

        // Enviar notificación por correo si el proveedor tiene correonotifi
        const editedEntry = updatedEntries.find((e) => e.id === editingEntryId);
        if (editedEntry) {
          sendMovementNotification(editedEntry, "edit").catch((err) => {
            console.error(
              "[NOTIFICATION] Error en notificación de movimiento editado:",
              err
            );
          });
        }

        try {
          // compute simple before/after CRC balances to help debug balance update issues
          const sumBalance = (entries: FondoEntry[]) => {
            let ingresosCRC = 0;
            let egresosCRC = 0;
            entries.forEach((en) => {
              const cur = (en.currency as "CRC" | "USD") || "CRC";
              if (cur === "CRC") {
                ingresosCRC += en.amountIngreso || 0;
                egresosCRC += en.amountEgreso || 0;
              }
            });
            return (Number(initialAmount) || 0) + ingresosCRC - egresosCRC;
          };
          const beforeBalance = sumBalance(fondoEntries);
          const afterBalance = sumBalance(updatedEntries);
          console.info("[FG-DEBUG] Edited movement saved", editingEntryId, {
            prevCount: fondoEntries.length,
            nextCount: updatedEntries.length,
            beforeBalanceCRC: beforeBalance,
            afterBalanceCRC: afterBalance,
          });
        } catch {
          console.info(
            "[FG-DEBUG] Edited movement saved (error computing debug balances)",
            editingEntryId
          );
        }

        resetFondoForm();
        if (!movementAutoCloseLocked) {
          setMovementModalOpen(false);
        }
        setIsSaving(false);
        return;
      }

      // CREAR nuevo movimiento
      const now = new Date();
      const iso = now.toISOString();
      // Use local time for the document id to avoid UTC surprises when searching by hour.
      const yyyy = now.getFullYear();
      const MM = String(now.getMonth() + 1).padStart(2, "0");
      const DD = String(now.getDate()).padStart(2, "0");
      const HH = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      const mmm = String(now.getMilliseconds()).padStart(3, "0");
      const dateKey = `${yyyy}_${MM}_${DD}`; // YYYY_MM_DD (local)
      const timeKey = `${HH}_${mm}_${ss}_${mmm}`; // HH_MM_SS_mmm (local, URL-safe)
      const movementId = `${dateKey}-${timeKey}_${accountKey}`;
      const entry: FondoEntry = {
        id: movementId,
        providerCode: selectedProvider,
        invoiceNumber: paddedInvoice,
        paymentType,
        amountEgreso: isEgreso ? egresoValue : 0,
        amountIngreso: isIngreso ? ingresoValue : 0,
        manager,
        notes: trimmedNotes,
        createdAt: iso,
        currency: movementCurrency,
      };

      // Preparar la lista actualizada ANTES de persistir
      const updatedEntries = [entry, ...fondoEntries];
      await persistCreatedMovement(entry, updatedEntries);
    } finally {
      setIsSaving(false);
    }
  };

  const startEditingEntry = (entry: FondoEntry) => {
    // Verificar si hay una edición en progreso o guardada recientemente (últimos 2 segundos)
    const now = Date.now();
    const timeSinceLastEdit = now - lastEditSaveTimestampRef.current;

    if (editingInProgressRef.current) {
      showToast(
        "Ya hay una edición en progreso. Completa o cancela la edición actual antes de editar otro movimiento.",
        "warning",
        5000
      );
      return;
    }

    if (timeSinceLastEdit < 2000) {
      showToast(
        "Debes esperar un momento antes de editar otro movimiento.",
        "warning",
        4000
      );
      return;
    }

    // Marcar que hay una edición en progreso
    editingInProgressRef.current = true;

    // Allow editing of entries even if previously edited; we accumulate audit history.
    setEditingEntryId(entry.id);
    setSelectedProvider(entry.providerCode);
    // Determine the correct payment type: use provider's type if exists, else entry's type
    const provider = providers.find((p) => p.code === entry.providerCode);
    const correctPaymentType = provider
      ? (provider.type as FondoEntry["paymentType"])
      : entry.paymentType;
    setPaymentType(correctPaymentType);
    setInvoiceNumber(entry.invoiceNumber);
    setManager(entry.manager);
    setNotes(entry.notes ?? "");
    setMovementCurrency((entry.currency as "CRC" | "USD") ?? "CRC");
    // Set amounts based on the correct payment type, using the entry's amounts
    const isEgreso =
      isEgresoType(correctPaymentType) || isGastoType(correctPaymentType);
    if (isEgreso) {
      setEgreso(
        Math.trunc(entry.amountEgreso || entry.amountIngreso).toString()
      );
      setIngreso("");
    } else {
      setIngreso(
        Math.trunc(entry.amountIngreso || entry.amountEgreso).toString()
      );
      setEgreso("");
    }
    setMovementModalOpen(true);
  };

  const isMovementLocked = useCallback(
    (entry: FondoEntry): boolean => {
      // Los ajustes automáticos siempre están bloqueados
      if (isAutoAdjustmentProvider(entry.providerCode)) {
        return true;
      }

      // El bloqueo por cierres solo aplica para Fondo General
      if (accountKey !== "FondoGeneral") {
        return false;
      }

      // Si no hay snapshot o no hay lockedUntil, no hay bloqueo
      const lockedUntil = storageSnapshotRef.current?.state?.lockedUntil;

      if (!lockedUntil) {
        return false;
      }

      try {
        const movementTime = new Date(entry.createdAt).getTime();
        const lockTime = new Date(lockedUntil).getTime();

        // Bloqueado si el movimiento es anterior o igual al último cierre
        const isLocked = movementTime <= lockTime;

        return isLocked;
      } catch {
        // Si hay error parseando fechas, no bloquear
        return false;
      }
    },
    [accountKey]
  );

  const handleEditMovement = (entry: FondoEntry) => {
    if (isMovementLocked(entry)) {
      showToast(
        "Este movimiento está bloqueado (anterior al último cierre).",
        "info",
        5000
      );
      return;
    }

    if (isAutoAdjustmentProvider(entry.providerCode)) {
      showToast("Los ajustes automáticos no se pueden editar.", "info", 5000);
      return;
    }

    // If this movement was generated from a daily closing, open the daily-closing modal
    // prefilled with that closing's values so the user edits the closing (not the generic movement).
    if (entry.originalEntryId) {
      const closingId = entry.originalEntryId;
      const record = dailyClosings.find((d) => d.id === closingId);
      if (!record) {
        // If we don't have the closing record locally, fall back to the generic editor.
        startEditingEntry(entry);
        return;
      }

      const initial: DailyClosingFormValues = {
        closingDate: record.closingDate,
        manager: record.manager,
        notes: record.notes ?? "",
        totalCRC: record.totalCRC ?? 0,
        totalUSD: record.totalUSD ?? 0,
        breakdownCRC: record.breakdownCRC ?? {},
        breakdownUSD: record.breakdownUSD ?? {},
      };
      setEditingDailyClosingId(record.id);
      setDailyClosingInitialValues(initial);
      setDailyClosingModalOpen(true);
      return;
    }

    // Default: open generic movement editor
    startEditingEntry(entry);
  };

  const cancelEditing = () => {
    editingInProgressRef.current = false;
    resetFondoForm();
  };

  // Check if current user is the principal admin (owner) of the company
  const isPrincipalAdmin = useMemo(() => {
    if (!user?.id || !companyData?.ownerId) return false;
    return String(user.id) === String(companyData.ownerId);
  }, [user, companyData]);

  const handleDeleteMovement = useCallback(
    (entry: FondoEntry) => {
      if (!isPrincipalAdmin) {
        showToast(
          "Solo el administrador principal puede eliminar movimientos",
          "error"
        );
        return;
      }

      if (isMovementLocked(entry)) {
        showToast(
          "Este movimiento está bloqueado (anterior al último cierre) y no puede eliminarse.",
          "error"
        );
        return;
      }

      if (isAutoAdjustmentProvider(entry.providerCode)) {
        showToast("Los ajustes automáticos no se pueden eliminar.", "error");
        return;
      }

      setConfirmDeleteEntry({ open: true, entry });
    },
    [isPrincipalAdmin, isMovementLocked, showToast]
  );

  const confirmDeleteMovement = useCallback(async () => {
    const entry = confirmDeleteEntry.entry;
    if (!entry) return;

    if (isSaving) return; // Prevenir múltiples envíos
    setIsSaving(true);

    try {
      // Preparar la lista actualizada SIN el movimiento a eliminar
      const updatedEntries = fondoEntries.filter((e) => e.id !== entry.id);

      // PRIMERO persistir a Firestore, LUEGO actualizar UI
      const saved = await persistMovementToFirestore(updatedEntries, "delete", {
        deleteId: entry.id,
        before: entry,
      });

      if (!saved.ok) {
        showToast(
          "Error al eliminar el movimiento. Por favor, intente de nuevo.",
          "error",
          5000
        );
        return; // NO actualizar la UI si falló el guardado
      }

      // Solo actualizar la UI si el guardado fue exitoso
      setFondoEntries(updatedEntries);

      // Close modal
      setConfirmDeleteEntry({ open: false, entry: null });

      if (saved.confirmed) {
        showToast("Movimiento eliminado exitosamente", "success");
      } else {
        showToast(
          "Eliminación guardada localmente; pendiente de sincronización (revisa tu conexión).",
          "warning",
          6000
        );
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    confirmDeleteEntry,
    showToast,
    fondoEntries,
    isSaving,
    persistMovementToFirestore,
  ]);

  const cancelDeleteMovement = useCallback(() => {
    setConfirmDeleteEntry({ open: false, entry: null });
  }, []);

  const isProviderSelectDisabled =
    !company || providersLoading || providers.length === 0;
  // Detectar si estamos editando un movimiento EXISTENTE de CIERRE FONDO VENTAS (bloquear cambio de proveedor)
  // Solo aplica cuando editamos, no cuando creamos un nuevo movimiento
  const isEditingCierreFondoVentas = useMemo(() => {
    if (!editingEntryId) return false;
    // Buscar el movimiento original que se está editando
    const originalEntry = fondoEntries.find((e) => e.id === editingEntryId);
    if (!originalEntry) return false;
    // Verificar si el proveedor ORIGINAL del movimiento es CIERRE FONDO VENTAS
    const originalProvider = providers.find(
      (p) => p.code === originalEntry.providerCode
    );
    return (
      originalProvider?.name?.toUpperCase() ===
      CIERRE_FONDO_VENTAS_PROVIDER_NAME
    );
  }, [editingEntryId, fondoEntries, providers]);

  const providersMap = useMemo(() => {
    const map = new Map<string, string>();
    providers.forEach((p) => map.set(p.code, p.name));
    return map;
  }, [providers]);
  const selectedProviderExists = selectedProvider
    ? providers.some((p) => p.code === selectedProvider)
    : false;

  // reset page when filters change so user sees first page of filtered results
  useEffect(() => {
    setPageIndex(0);
  }, [
    filterProviderCode,
    filterPaymentType,
    filterEditedOnly,
    searchQuery,
    fromFilter,
    toFilter,
  ]);

  const invoiceValid =
    /^[0-9]{1,4}$/.test(invoiceNumber) || invoiceNumber.length === 0;
  const egresoValue = Number.parseInt(egreso, 10);
  const ingresoValue = Number.parseInt(ingreso, 10);
  const egresoValid = isEgreso
    ? !Number.isNaN(egresoValue) && egresoValue > 0
    : true;
  const ingresoValid = isIngreso
    ? !Number.isNaN(ingresoValue) && ingresoValue > 0
    : true;
  const requiredAmountProvided = isEgreso
    ? egreso.trim().length > 0
    : ingreso.trim().length > 0;

  const { currentBalanceCRC, currentBalanceUSD } = useMemo(() => {
    return {
      // currentBalance debe ser el balance real persistido, no el del rango filtrado.
      // Si el usuario ajusta initialBalance, reflejamos el delta sin depender de movimientos cargados.
      currentBalanceCRC:
        ledgerSnapshot.currentCRC +
        ((Number(initialAmount) || 0) - ledgerSnapshot.initialCRC),
      currentBalanceUSD:
        ledgerSnapshot.currentUSD +
        ((Number(initialAmountUSD) || 0) - ledgerSnapshot.initialUSD),
    };
  }, [ledgerSnapshot, initialAmount, initialAmountUSD]);

  const balanceAfterByIdCRC = useMemo(() => {
    // Derivar balances desde el currentBalance real (persistido), no desde initialAmount + subset.
    // Caminamos hacia atrás: balanceAfter(entry) se obtiene restando deltas de movimientos más recientes.
    let running = Math.trunc(currentBalanceCRC);
    const orderedDesc = [...fondoEntries]
      .filter((e) => ((e.currency as any) || "CRC") === "CRC")
      .sort((a, b) => {
        const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (diff !== 0) return diff;
        return String(b.id).localeCompare(String(a.id));
      });
    const map = new Map<string, number>();
    orderedDesc.forEach((entry) => {
      map.set(entry.id, running);
      running -= Math.trunc(entry.amountIngreso || 0);
      running += Math.trunc(entry.amountEgreso || 0);
    });
    return map;
  }, [fondoEntries, currentBalanceCRC]);

  const balanceAfterByIdUSD = useMemo(() => {
    let running = Math.trunc(currentBalanceUSD);
    const orderedDesc = [...fondoEntries]
      .filter((e) => ((e.currency as any) || "CRC") === "USD")
      .sort((a, b) => {
        const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (diff !== 0) return diff;
        return String(b.id).localeCompare(String(a.id));
      });
    const map = new Map<string, number>();
    orderedDesc.forEach((entry) => {
      map.set(entry.id, running);
      running -= Math.trunc(entry.amountIngreso || 0);
      running += Math.trunc(entry.amountEgreso || 0);
    });
    return map;
  }, [fondoEntries, currentBalanceUSD]);

  useEffect(() => {
    if (!entriesHydrated || hydratedAccountKey !== accountKey) return;
    const normalizedCompany = (company || "").trim();
    if (
      normalizedCompany.length === 0 ||
      hydratedCompany.toLowerCase() !== normalizedCompany.toLowerCase()
    ) {
      return;
    }

    const persistEntries = async () => {
      const companyKey =
        MovimientosFondosService.buildCompanyMovementsKey(normalizedCompany);
      let storageToPersist: MovementStorage<FondoEntry> | null = null;

      const normalizedInitialCRC =
        initialAmount.trim().length > 0 ? initialAmount.trim() : "0";
      const normalizedInitialUSD =
        initialAmountUSD.trim().length > 0 ? initialAmountUSD.trim() : "0";
      const hasSnapshot = Boolean(storageSnapshotRef.current);
      const metadataDiffers =
        normalizedInitialCRC !== "0" ||
        normalizedInitialUSD !== "0" ||
        !currencyEnabled.CRC ||
        !currencyEnabled.USD;

      if (!hasSnapshot && !metadataDiffers) {
        return;
      }

      try {
        const baseStorage = storageSnapshotRef.current
          ? MovimientosFondosService.ensureMovementStorageShape<FondoEntry>(
            storageSnapshotRef.current,
            normalizedCompany
          )
          : MovimientosFondosService.createEmptyMovementStorage<FondoEntry>(
            normalizedCompany
          );
        baseStorage.company = normalizedCompany;
        // V2: movements are stored in a subcollection. Never persist movements array to main doc.
        baseStorage.operations = { movements: [] };

        const stateSnapshot =
          baseStorage.state ??
          MovimientosFondosService.createEmptyMovementStorage<FondoEntry>(
            normalizedCompany
          ).state;
        const parsedInitialCRC = Number(normalizedInitialCRC) || 0;
        const parsedInitialUSD = Number(normalizedInitialUSD) || 0;

        const parseBalance = (value: unknown) => {
          const parsed = typeof value === "number" ? value : Number(value);
          return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
        };

        const existingCRC = stateSnapshot.balancesByAccount.find(
          (balance) =>
            balance.accountId === accountKey && balance.currency === "CRC"
        );
        const existingUSD = stateSnapshot.balancesByAccount.find(
          (balance) =>
            balance.accountId === accountKey && balance.currency === "USD"
        );

        const prevInitialCRC = parseBalance(existingCRC?.initialBalance ?? 0);
        const prevInitialUSD = parseBalance(existingUSD?.initialBalance ?? 0);
        const prevCurrentCRC = parseBalance(
          existingCRC?.currentBalance ?? prevInitialCRC
        );
        const prevCurrentUSD = parseBalance(
          existingUSD?.currentBalance ?? prevInitialUSD
        );

        // Cambiar initialBalance ajusta currentBalance por el mismo delta.
        // No dependemos de `fondoEntries` porque pueden ser parciales por filtros.
        const nextCurrentCRC =
          prevCurrentCRC + (parsedInitialCRC - prevInitialCRC);
        const nextCurrentUSD =
          prevCurrentUSD + (parsedInitialUSD - prevInitialUSD);

        const nextCRC = {
          accountId: accountKey,
          currency: "CRC" as const,
          enabled: currencyEnabled.CRC,
          initialBalance: parsedInitialCRC,
          currentBalance: nextCurrentCRC,
        };
        const nextUSD = {
          accountId: accountKey,
          currency: "USD" as const,
          enabled: currencyEnabled.USD,
          initialBalance: parsedInitialUSD,
          currentBalance: nextCurrentUSD,
        };

        const crcChanged =
          !existingCRC ||
          existingCRC.enabled !== nextCRC.enabled ||
          existingCRC.initialBalance !== nextCRC.initialBalance ||
          existingCRC.currentBalance !== nextCRC.currentBalance;
        const usdChanged =
          !existingUSD ||
          existingUSD.enabled !== nextUSD.enabled ||
          existingUSD.initialBalance !== nextUSD.initialBalance ||
          existingUSD.currentBalance !== nextUSD.currentBalance;

        // If nothing changed for this account, do not write back to Firestore/localStorage.
        if (!crcChanged && !usdChanged) {
          return;
        }

        const nextAccountBalances = stateSnapshot.balancesByAccount.filter(
          (balance) => balance.accountId !== accountKey
        );
        nextAccountBalances.push(nextCRC, nextUSD);
        stateSnapshot.balancesByAccount = nextAccountBalances;
        stateSnapshot.updatedAt = new Date().toISOString();
        // Preservar lockedUntil del snapshot actual si existe
        if (storageSnapshotRef.current?.state?.lockedUntil) {
          stateSnapshot.lockedUntil =
            storageSnapshotRef.current.state.lockedUntil;
        }
        baseStorage.state = stateSnapshot;

        // Sync UI snapshot
        setLedgerSnapshot({
          initialCRC: parsedInitialCRC,
          currentCRC: nextCurrentCRC,
          initialUSD: parsedInitialUSD,
          currentUSD: nextCurrentUSD,
        });

        // Guardar snapshot liviano en localStorage
        try {
          localStorage.setItem(companyKey, JSON.stringify(baseStorage));
        } catch (storageError) {
          console.warn(
            "[FG-V2] localStorage snapshot write failed:",
            storageError
          );
        }

        const legacyKey = buildStorageKey(namespace, FONDO_KEY_SUFFIX);
        localStorage.removeItem(legacyKey);

        if (resolvedOwnerId) {
          const legacyOwnerKey =
            MovimientosFondosService.buildLegacyOwnerMovementsKey(
              resolvedOwnerId
            );
          if (legacyOwnerKey !== companyKey) {
            localStorage.removeItem(legacyOwnerKey);
          }
        }

        storageSnapshotRef.current = baseStorage;
        storageToPersist = baseStorage;
      } catch (err) {
        console.error("Error preparing fondo entries for persistence:", err);
      }

      if (!storageToPersist) return;

      try {
        await MovimientosFondosService.saveDocument(
          companyKey,
          storageToPersist
        );
      } catch (err) {
        console.error("Error storing fondo entries to Firestore:", err);
      }
    };

    void persistEntries();
  }, [
    namespace,
    entriesHydrated,
    company,
    hydratedCompany,
    resolvedOwnerId,
    currencyEnabled,
    initialAmount,
    initialAmountUSD,
    accountKey,
    hydratedAccountKey,
    setLedgerSnapshot,
  ]);

  const isSubmitDisabled =
    !company ||
    (!editingEntryId && isProviderSelectDisabled) ||
    !invoiceValid ||
    !requiredAmountProvided ||
    !egresoValid ||
    !ingresoValid ||
    !manager ||
    employeesLoading ||
    isSaving;

  const amountFormatter = useMemo(
    () =>
      new Intl.NumberFormat("es-CR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    []
  );
  const amountFormatterUSD = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    []
  );
  const dailyClosingDateFormatter = useMemo(
    () => new Intl.DateTimeFormat("es-CR", { dateStyle: "long" }),
    []
  );
  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("es-CR", {
        dateStyle: "short",
        timeStyle: "short",
      }),
    []
  );
  const formatByCurrency = (currency: "CRC" | "USD", value: number) =>
    currency === "USD"
      ? `$ ${amountFormatterUSD.format(Math.trunc(value))}`
      : `₡ ${amountFormatter.format(Math.trunc(value))}`;

  const formatDailyClosingDiff = (currency: "CRC" | "USD", diff: number) => {
    if (diff === 0) return "Sin diferencias";
    const sign = diff > 0 ? "+" : "-";
    return `${sign} ${formatByCurrency(currency, Math.abs(diff))}`;
  };

  const getDailyClosingDiffClass = (diff: number) => {
    if (diff === 0) return "text-[var(--muted-foreground)]";
    return diff > 0 ? "text-green-500" : "text-red-500";
  };

  const buildBreakdownLines = (
    currency: "CRC" | "USD",
    breakdown?: Record<number, number>
  ) => {
    if (!breakdown) return [] as string[];
    return Object.entries(breakdown)
      .filter(([, count]) => count > 0)
      .map(
        ([denomination, count]) =>
          `${count} x ${formatByCurrency(currency, Number(denomination))}`
      );
  };

  const amountClass = (
    isActive: boolean,
    inputHasValue: boolean,
    isValid: boolean
  ) => {
    if (!isActive) return "border-[var(--input-border)]";
    if (inputHasValue && !isValid) return "border-red-500";
    return "border-[var(--input-border)]";
  };

  const handleProviderChange = (value: string) => {
    setSelectedProvider(value);
    setProviderError(""); // Clear error when user starts typing
    const oldPaymentType = paymentType;
    try {
      const prov = providers.find((p) => p.code === value);
      if (prov && prov.type && isFondoMovementType(prov.type)) {
        setPaymentType(prov.type as FondoEntry["paymentType"]);
      } else {
        // fallback to default when provider has no type or it's invalid
        setPaymentType("COMPRA INVENTARIO");
      }
    } catch {
      // defensive: ensure UI remains usable on unexpected provider shapes
      setPaymentType("COMPRA INVENTARIO");
    }
    // Move amount between egreso and ingreso fields if type changes
    const oldIsEgreso =
      isEgresoType(oldPaymentType) || isGastoType(oldPaymentType);
    const newIsEgreso = isEgresoType(paymentType) || isGastoType(paymentType);
    if (oldIsEgreso && !newIsEgreso && egreso.trim()) {
      setIngreso(egreso);
      setEgreso("");
    } else if (!oldIsEgreso && newIsEgreso && ingreso.trim()) {
      setEgreso(ingreso);
      setIngreso("");
    }
  };
  const handleInvoiceNumberChange = (value: string) => {
    setInvoiceNumber(value.replace(/\D/g, "").slice(0, 4));
    setInvoiceError(""); // Clear error when user starts typing
  };
  // paymentType is derived from the selected provider; no manual change handler needed
  const handleEgresoChange = (value: string) => {
    setEgreso(normalizeMoneyInput(value));
    setAmountError(""); // Clear error when user starts typing
  };
  const handleIngresoChange = (value: string) => {
    setIngreso(normalizeMoneyInput(value));
    setAmountError(""); // Clear error when user starts typing
  };
  const handleNotesChange = (value: string) => setNotes(value);
  const handleManagerChange = (value: string) => {
    setManager(value);
    setManagerError(""); // Clear error when user starts typing
  };

  const managerSelectDisabled =
    !company || employeesLoading || employeeOptions.length === 0;
  const invoiceDisabled = !company;
  const egresoBorderClass = amountClass(
    isEgreso,
    egreso.trim().length > 0,
    egresoValid
  );
  const ingresoBorderClass = amountClass(
    isIngreso,
    ingreso.trim().length > 0,
    ingresoValid
  );

  const closeMovementModal = () => {
    setMovementModalOpen(false);
    resetFondoForm();
    setMovementAutoCloseLocked(false);
  };
  const openCreateMovementDrawer = useCallback(() => {
    resetFondoForm();
    setMovementCurrency(currencyEnabled.CRC ? "CRC" : "USD");
    // If a provider is already selected, derive paymentType from it so the form
    // doesn't stay with the reset default ('COMPRA INVENTARIO'). This prevents
    // cases where the UI shows a provider whose configured type (e.g. 'OTROS INGRESOS')
    // is ignored because resetFondoForm set the paymentType to the default.
    if (selectedProvider) {
      try {
        const prov = providers.find((p) => p.code === selectedProvider);
        if (prov && prov.type && isFondoMovementType(prov.type)) {
          setPaymentType(prov.type as FondoEntry["paymentType"]);
        } else {
          setPaymentType("COMPRA INVENTARIO");
        }
      } catch {
        setPaymentType("COMPRA INVENTARIO");
      }
    }
    // If this FondoSection instance is scoped to ingresos/egresos, force that default
    if (mode === "ingreso") setPaymentType(FONDO_INGRESO_TYPES[0]);
    if (mode === "egreso") setPaymentType(FONDO_EGRESO_TYPES[0]);
    setMovementModalOpen(true);
  }, [resetFondoForm, currencyEnabled.CRC, selectedProvider, providers, mode]);

  const confirmOpenCreateMovementNow = useCallback(() => {
    setConfirmOpenCreateMovement(false);
    openCreateMovementDrawer();
  }, [openCreateMovementDrawer]);

  const handleOpenCreateMovement = () => {
    // Confirmación solo para cuentas (BCR/BN/BAC), para evitar confusiones.
    if (accountKey !== "FondoGeneral") {
      setConfirmOpenCreateMovement(true);
      return;
    }

    openCreateMovementDrawer();
  };

  const handleOpenDailyClosing = () => {
    if (accountKey !== "FondoGeneral") return;
    setEditingDailyClosingId(null);

    // Find the last "CIERRE FONDO VENTAS" movement to get the default manager
    const lastCierreVentas = [...fondoEntries]
      .filter((entry) => {
        const provider = providers.find((p) => p.code === entry.providerCode);
        return (
          provider?.name?.toUpperCase() === CIERRE_FONDO_VENTAS_PROVIDER_NAME
        );
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

    const initialValues: DailyClosingFormValues = {
      closingDate: new Date().toISOString(),
      manager: lastCierreVentas?.manager || "",
      notes: "",
      totalCRC: currentBalanceCRC,
      totalUSD: currentBalanceUSD,
      breakdownCRC: {},
      breakdownUSD: {},
    };

    setDailyClosingInitialValues(initialValues);
    setDailyClosingModalOpen(true);
  };

  const handleCloseDailyClosing = () => {
    setDailyClosingModalOpen(false);
    setEditingDailyClosingId(null);
    setDailyClosingInitialValues(null);
  };

  const handleConfirmDailyClosing = async (closing: DailyClosingFormValues) => {
    if (accountKey !== "FondoGeneral") {
      setDailyClosingModalOpen(false);
      return;
    }

    const managerName = closing.manager.trim();
    if (!managerName) {
      setDailyClosingModalOpen(false);
      return;
    }

    let closingDateValue = closing.closingDate
      ? new Date(closing.closingDate)
      : new Date();
    if (Number.isNaN(closingDateValue.getTime())) {
      closingDateValue = new Date();
    }

    const createdAtDate = new Date();
    const createdAt = createdAtDate.toISOString();
    const diffCRC =
      Math.trunc(closing.totalCRC) - Math.trunc(currentBalanceCRC);
    const diffUSD =
      Math.trunc(closing.totalUSD) - Math.trunc(currentBalanceUSD);
    const userNotes = closing.notes.trim();
    const closingDateKey = dateKeyFromDate(closingDateValue);

    const record: DailyClosingRecord = {
      id: editingDailyClosingId ?? `${Date.now()}`,
      createdAt: editingDailyClosingId
        ? dailyClosings.find((d) => d.id === editingDailyClosingId)
          ?.createdAt ?? createdAt
        : createdAt,
      closingDate: closingDateValue.toISOString(),
      manager: managerName,
      totalCRC: Math.trunc(closing.totalCRC),
      totalUSD: Math.trunc(closing.totalUSD),
      recordedBalanceCRC: Math.trunc(currentBalanceCRC),
      recordedBalanceUSD: Math.trunc(currentBalanceUSD),
      diffCRC,
      diffUSD,
      notes: userNotes,
      breakdownCRC: closing.breakdownCRC ?? {},
      breakdownUSD: closing.breakdownUSD ?? {},
    };

    const normalizedCompany = (company || "").trim();
    if (normalizedCompany.length === 0) {
      setDailyClosingModalOpen(false);
      showToast("Error: No se pudo identificar la empresa", "error");
      return;
    }

    // Save to Firestore first and wait for confirmation
    beginDailyClosingsRequest();
    try {
      await DailyClosingsService.saveClosing(normalizedCompany, record);
      console.log(`[CIERRE] ✅ Cierre guardado exitosamente en Firestore. ID: ${record.id}, Fecha: ${record.closingDate}`);
      
      // Only update local state after successful save
      setDailyClosings((prev) => mergeDailyClosingRecords(prev, [record]));
      loadedDailyClosingKeysRef.current.add(closingDateKey);
      loadingDailyClosingKeysRef.current.delete(closingDateKey);
      setDailyClosingsHydrated(true);

      setPendingCierreDeCaja(false);
      setDailyClosingModalOpen(false);
    } catch (err) {
      console.error("[CIERRE] ❌ Error guardando cierre en Firestore:", err);

      // Alert email for save failures (non-blocking)
      try {
        const whenISO = new Date().toISOString();
        const where = "FondoSection.handleConfirmDailyClosing -> DailyClosingsService.saveClosing";
        const errorMessage =
          err instanceof Error
            ? `${err.name}: ${err.message}${err.stack ? `\n\nStack:\n${err.stack}` : ""}`
            : typeof err === "string"
              ? err
              : JSON.stringify(err);

        const subject = `[ALERTA][CIERRE] Error al guardar cierre (${normalizedCompany})`;
        const text = [
          `Dónde: ${where}`,
          `Cuándo: ${whenISO}`,
          `Empresa: ${normalizedCompany}`,
          `Usuario: ${(user?.email || "N/A").toString()}`,
          `Cierre ID: ${record.id}`,
          `Fecha cierre: ${record.closingDate}`,
          "",
          `Error: ${errorMessage}`,
        ].join("\n");

        const recipients = ["chavesa698@gmail.com", "price.master.srl@gmail.com"];
        void Promise.all(
          recipients.map((to) =>
            addDoc(collection(db, "mail"), {
              to,
              subject,
              text,
              createdAt: serverTimestamp(),
            })
          )
        ).catch((mailErr) => {
          console.error("[CIERRE] ❌ Error encolando email de alerta:", mailErr);
        });
      } catch (mailErr) {
        console.error("[CIERRE] ❌ Error preparando email de alerta:", mailErr);
      }

      showToast(
        "Error al guardar el cierre. Por favor, intente de nuevo.",
        "error",
        5000
      );
      return;
    } finally {
      finishDailyClosingsRequest();
    }

    const notificationRecipients = new Set<string>();
    const adminRecipient = ownerAdminEmail?.trim();
    if (adminRecipient) {
      notificationRecipients.add(adminRecipient);
    } else if (activeOwnerId) {
      console.warn("Daily closing email: missing admin recipient for owner.", {
        ownerId: activeOwnerId,
        company: normalizedCompany,
      });
    }
    const userEmail = user?.email?.trim();
    if (userEmail) notificationRecipients.add(userEmail);

    const emailTemplate = buildDailyClosingEmailTemplate({
      company: normalizedCompany,
      accountKey,
      closingDateISO: record.closingDate,
      manager: record.manager,
      totalCRC: record.totalCRC,
      totalUSD: record.totalUSD,
      recordedBalanceCRC: record.recordedBalanceCRC,
      recordedBalanceUSD: record.recordedBalanceUSD,
      diffCRC: record.diffCRC,
      diffUSD: record.diffUSD,
      notes: record.notes,
    });

    if (notificationRecipients.size === 0 && activeOwnerId) {
      console.warn(
        "Daily closing email: skipped sending notification because no recipients were resolved.",
        {
          ownerId: activeOwnerId,
          company: normalizedCompany,
        }
      );
    }

    // Crear documentos en la colección 'mail' para que la extensión Firebase Trigger Email los procese
    for (const recipient of notificationRecipients) {
      if (!recipient) continue;
      try {
        const docRef = await addDoc(collection(db, "mail"), {
          to: recipient,
          subject: emailTemplate.subject,
          text: emailTemplate.text,
          html: emailTemplate.html,
          createdAt: serverTimestamp(),
        });
        console.log(
          `[MAIL-DOC] Documento creado en 'mail' para ${recipient}, ID: ${docRef.id}`
        );
        showToast("Correo de cierre diario enviado correctamente", "success");
      } catch (err) {
        console.error(
          `[MAIL-DOC] Error creando documento en 'mail' para ${recipient}:`,
          err
        );
        showToast("Error al enviar correo de cierre diario", "error");
      }
    }

    // Create or update movement(s) that reflect the difference so the balance updates accordingly.
    // We create one FondoEntry per currency where diff != 0. These are regular movements (editable)
    // and will appear in the movements list so users can later edit them (and edits will be audited
    // using the existing edit flow which marks entries as 'Editado').
    try {
      const newMovements: FondoEntry[] = [];

      const buildCierreMovementBaseId = (when: Date) => {
        // Local time, URL-safe: 2025_12_15-02_10_38_929_CIERRE
        const yyyy = when.getFullYear();
        const MM = String(when.getMonth() + 1).padStart(2, "0");
        const DD = String(when.getDate()).padStart(2, "0");
        const HH = String(when.getHours()).padStart(2, "0");
        const mm = String(when.getMinutes()).padStart(2, "0");
        const ss = String(when.getSeconds()).padStart(2, "0");
        const mmm = String(when.getMilliseconds()).padStart(3, "0");
        const dateKey = `${yyyy}_${MM}_${DD}`;
        const timeKey = `${HH}_${mm}_${ss}_${mmm}`;
        return `${dateKey}-${timeKey}_CIERRE`;
      };

      const cierreBaseId = buildCierreMovementBaseId(createdAtDate);
      // If we're editing an existing closing, compute diffs relative to the balance
      // excluding the previous generated adjustment(s). This avoids flipping an
      // existing entry from egreso -> ingreso and double-counting.
      let adjustedDiffCRC = record.diffCRC;
      let adjustedDiffUSD = record.diffUSD;
      if (editingDailyClosingId) {
        let prevCRCContribution = 0;
        let prevUSDContribution = 0;
        fondoEntries.forEach((e) => {
          if (
            e.originalEntryId === record.id &&
            isAutoAdjustmentProvider(e.providerCode)
          ) {
            const contrib = (e.amountIngreso || 0) - (e.amountEgreso || 0);
            if (e.currency === "USD") prevUSDContribution += contrib;
            else prevCRCContribution += contrib;
          }
        });
        const baseBalanceCRC = currentBalanceCRC - prevCRCContribution;
        const baseBalanceUSD = currentBalanceUSD - prevUSDContribution;
        adjustedDiffCRC =
          Math.trunc(closing.totalCRC) - Math.trunc(baseBalanceCRC);
        adjustedDiffUSD =
          Math.trunc(closing.totalUSD) - Math.trunc(baseBalanceUSD);
        // update the record diffs so persistence reflects the adjusted values
        record.diffCRC = adjustedDiffCRC;
        record.diffUSD = adjustedDiffUSD;
        // When editing a closing, the recorded balance should reflect the underlying
        // account balance excluding previous automatic adjustments, so store the
        // base balance instead of the currentBalance (which contains those adjustments).
        try {
          record.recordedBalanceCRC = Math.trunc(baseBalanceCRC);
          record.recordedBalanceUSD = Math.trunc(baseBalanceUSD);
        } catch (rbErr) {
          console.error(
            "[FG-DEBUG] Error setting recordedBalance on edited closing:",
            rbErr
          );
        }

        console.info("[FG-DEBUG] Editing closing values", {
          closingTotalCRC: closing.totalCRC,
          currentBalanceCRC,
          prevCRCContribution,
          baseBalanceCRC,
          adjustedDiffCRC,
        });
      }

      const willCreateInfo = adjustedDiffCRC === 0 && adjustedDiffUSD === 0;
      const willCreateCRC = !willCreateInfo && Boolean(adjustedDiffCRC);
      const willCreateUSD = !willCreateInfo && Boolean(adjustedDiffUSD);
      const plannedCount =
        Number(willCreateCRC) + Number(willCreateUSD) + Number(willCreateInfo);

      if (adjustedDiffCRC && adjustedDiffCRC !== 0) {
        const diff = Math.trunc(adjustedDiffCRC);
        const isPositive = diff > 0;
        const paymentType = isPositive
          ? AUTO_ADJUSTMENT_MOVEMENT_TYPE_INGRESO
          : AUTO_ADJUSTMENT_MOVEMENT_TYPE_EGRESO;
        const entry: FondoEntry = {
          id: cierreBaseId,
          providerCode: AUTO_ADJUSTMENT_PROVIDER_CODE,
          invoiceNumber: String(Math.abs(diff)).padStart(4, "0"),
          paymentType,
          amountEgreso: isPositive ? 0 : Math.abs(diff),
          amountIngreso: isPositive ? diff : 0,
          manager: AUTO_ADJUSTMENT_MANAGER,
          notes: `AJUSTE APLICADO AL SALDO ACTUAL\n[ALERT_ICON]Diferencia CRC: ${diff >= 0 ? "+ " : "- "
            }${formatByCurrency("CRC", Math.abs(diff))}.${userNotes ? ` Notas: ${userNotes}` : ""
            }`,
          createdAt,
          accountId: accountKey,
          currency: "CRC",
          breakdown: closing.breakdownCRC ?? {},
        } as FondoEntry;
        newMovements.push(entry);
      }

      if (adjustedDiffUSD && adjustedDiffUSD !== 0) {
        const diff = Math.trunc(adjustedDiffUSD);
        const isPositive = diff > 0;
        const paymentType = isPositive
          ? AUTO_ADJUSTMENT_MOVEMENT_TYPE_INGRESO
          : AUTO_ADJUSTMENT_MOVEMENT_TYPE_EGRESO;
        const entry: FondoEntry = {
          id: plannedCount > 1 ? `${cierreBaseId}_USD` : cierreBaseId,
          providerCode: AUTO_ADJUSTMENT_PROVIDER_CODE,
          invoiceNumber: String(Math.abs(diff)).padStart(4, "0"),
          paymentType,
          amountEgreso: isPositive ? 0 : Math.abs(diff),
          amountIngreso: isPositive ? diff : 0,
          manager: AUTO_ADJUSTMENT_MANAGER,
          notes: `AJUSTE APLICADO AL SALDO ACTUAL\n[ALERT_ICON]Diferencia USD: ${diff >= 0 ? "+ " : "- "
            }${formatByCurrency("USD", Math.abs(diff))}.${userNotes ? ` Notas: ${userNotes}` : ""
            }`,
          createdAt,
          accountId: accountKey,
          currency: "USD",
        } as FondoEntry;
        if ((entry as any).currency === "USD")
          (entry as any).breakdown = closing.breakdownUSD ?? {};
        newMovements.push(entry);
      }

      if (adjustedDiffCRC === 0 && adjustedDiffUSD === 0) {
        const entry: FondoEntry = {
          id: cierreBaseId,
          providerCode: AUTO_ADJUSTMENT_PROVIDER_CODE,
          invoiceNumber: "0000",
          paymentType: "INFORMATIVO" as any, // Tipo especial para cierres sin diferencias
          amountEgreso: 0,
          amountIngreso: 0,
          manager: AUTO_ADJUSTMENT_MANAGER,
          notes: `[CHECK_ICON]Sin diferencias.${userNotes ? ` Notas: ${userNotes}` : ""
            }`,
          createdAt,
          accountId: accountKey,
          currency: "CRC",
          breakdown: closing.breakdownCRC ?? {},
        } as FondoEntry;
        newMovements.push(entry);
      }
      if (editingDailyClosingId && newMovements.length === 0) {
        // No diff now: remove previous adjustment movements linked to this closing
        console.info(
          "[FG-DEBUG] Removing previous adjustment movements for closing",
          record.id,
          { beforeCount: fondoEntries.length }
        );

        // Persistir eliminación de ajustes para que el currentBalance se revierta.
        try {
          const toRemoveNow = fondoEntries.filter(
            (e) =>
              e.originalEntryId === record.id &&
              isAutoAdjustmentProvider(e.providerCode)
          );
          for (const removed of toRemoveNow) {
            await persistMovementToFirestore(fondoEntries, "delete", {
              deleteId: removed.id,
              before: removed,
            });
          }
        } catch (persistRemoveErr) {
          console.error(
            "[FG-DEBUG] Error persisting deletion of adjustment movements:",
            persistRemoveErr
          );
        }

        setFondoEntries((prev) => {
          const toRemove = prev.filter(
            (e) =>
              e.originalEntryId === record.id &&
              isAutoAdjustmentProvider(e.providerCode)
          );
          const filtered = prev.filter(
            (e) =>
              !(
                e.originalEntryId === record.id &&
                isAutoAdjustmentProvider(e.providerCode)
              )
          );
          console.info("[FG-DEBUG] After remove, count:", filtered.length);
          if (toRemove.length > 0) {
            try {
              const resolution = {
                removedAdjustments: toRemove.map((r) => ({
                  id: r.id,
                  currency: r.currency,
                  amount: (r.amountIngreso || 0) - (r.amountEgreso || 0),
                  amountIngreso: r.amountIngreso || 0,
                  amountEgreso: r.amountEgreso || 0,
                  manager: r.manager,
                  createdAt: r.createdAt,
                })),
                note: "Ajustes eliminados manualmente al editar el cierre",
              } as any;

              setDailyClosings((prevClosings) => {
                const updated = prevClosings.map((d) => {
                  if (d.id !== record.id) return d;
                  return {
                    ...d,
                    adjustmentResolution: resolution,
                  } as DailyClosingRecord;
                });
                try {
                  const updatedRecord = updated.find((d) => d.id === record.id);
                  if (updatedRecord && normalizedCompany.length > 0) {
                    // Fire-and-forget save for adjustment updates (non-critical)
                    void DailyClosingsService.saveClosing(
                      normalizedCompany,
                      updatedRecord
                    ).then(() => {
                      console.log(`[CIERRE] ✅ Ajuste de cierre guardado exitosamente. ID: ${updatedRecord.id}`);
                    }).catch((saveErr) => {
                      console.error(
                        "[CIERRE] ❌ Error saving updated daily closing with resolution:",
                        saveErr
                      );
                    });
                  }
                } catch (saveErr) {
                  console.error(
                    "[CIERRE] ❌ Error persisting daily closing resolution:",
                    saveErr
                  );
                }
                return updated;
              });
            } catch (err) {
              console.error(
                "Error preparing adjustment resolution summary:",
                err
              );
            }
          }

          return filtered;
        });
      }

      if (newMovements.length > 0) {
        // link movements to the daily closing via originalEntryId
        newMovements.forEach((m) => (m.originalEntryId = record.id));

        // Persistir ajustes al documento principal para actualizar currentBalance.
        // En edición: actualiza/elimina por moneda; en creación: crea movimientos nuevos.
        try {
          const normalizeCurrency = (value: unknown): MovementCurrencyKey =>
            value === "USD" ? "USD" : "CRC";

          const plannedCurrencies = new Set<MovementCurrencyKey>(
            newMovements.map((m) => normalizeCurrency(m.currency))
          );

          const existingAdjustments = editingDailyClosingId
            ? fondoEntries.filter(
              (e) =>
                e.originalEntryId === record.id &&
                isAutoAdjustmentProvider(e.providerCode)
            )
            : [];

          const existingByCurrency = new Map<MovementCurrencyKey, FondoEntry>();
          existingAdjustments.forEach((e) => {
            existingByCurrency.set(normalizeCurrency(e.currency), e);
          });

          // Remove previous adjustments that are no longer present (editing scenario)
          if (editingDailyClosingId) {
            for (const prevAdj of existingAdjustments) {
              const cur = normalizeCurrency(prevAdj.currency);
              if (!plannedCurrencies.has(cur)) {
                await persistMovementToFirestore(fondoEntries, "delete", {
                  deleteId: prevAdj.id,
                  before: prevAdj,
                });
              }
            }
          }

          // Upsert per currency
          for (const movement of newMovements) {
            const cur = normalizeCurrency(movement.currency);
            const existing = existingByCurrency.get(cur);

            if (editingDailyClosingId && existing) {
              const updatedForPersist: FondoEntry = {
                ...existing,
                paymentType: movement.paymentType,
                invoiceNumber: movement.invoiceNumber,
                amountEgreso: movement.amountEgreso,
                amountIngreso: movement.amountIngreso,
                notes: movement.notes,
                breakdown: movement.breakdown ?? existing.breakdown,
                createdAt: movement.createdAt,
                manager: AUTO_ADJUSTMENT_MANAGER,
                providerCode: AUTO_ADJUSTMENT_PROVIDER_CODE,
                accountId: accountKey,
                currency: cur,
                originalEntryId: record.id,
              } as FondoEntry;

              await persistMovementToFirestore(fondoEntries, "edit", {
                upsert: updatedForPersist,
                before: existing,
              });
            } else {
              // Creating a new adjustment movement
              await persistMovementToFirestore(
                [movement, ...fondoEntries],
                "create",
                { upsert: movement }
              );
            }
          }
        } catch (persistAdjErr) {
          console.error(
            "[FG-DEBUG] Error persisting daily closing adjustments to main ledger:",
            persistAdjErr
          );
        }

        if (editingDailyClosingId) {
          // update existing related movement(s), preserve audit history
          setFondoEntries((prev) => {
            console.info(
              "[FG-DEBUG] Updating existing related adjustment movements for closing",
              record.id,
              { prevCount: prev.length, newMovements }
            );
            const updated = prev.map((e) => {
              if (
                e.originalEntryId === record.id &&
                isAutoAdjustmentProvider(e.providerCode)
              ) {
                const match = newMovements.find(
                  (nm) => nm.currency === e.currency
                );
                if (!match) return e;
                // build audit history
                let history: any[] = [];
                try {
                  const existing = e.auditDetails
                    ? (JSON.parse(e.auditDetails) as any)
                    : null;
                  if (existing && Array.isArray(existing.history))
                    history = existing.history.slice();
                  else if (existing && existing.before && existing.after)
                    history = [
                      {
                        at: existing.at ?? e.createdAt,
                        before: existing.before,
                        after: existing.after,
                      },
                    ];
                } catch {
                  history = [];
                }
                // Crear registro simplificado con solo los campos que cambiaron
                const changedFields = getChangedFields(
                  {
                    providerCode: e.providerCode,
                    invoiceNumber: e.invoiceNumber,
                    paymentType: e.paymentType,
                    amountEgreso: e.amountEgreso,
                    amountIngreso: e.amountIngreso,
                    manager: e.manager,
                    notes: e.notes,
                    currency: e.currency,
                  },
                  {
                    providerCode: e.providerCode,
                    invoiceNumber: match.invoiceNumber,
                    paymentType: match.paymentType,
                    amountEgreso: match.amountEgreso,
                    amountIngreso: match.amountIngreso,
                    manager: AUTO_ADJUSTMENT_MANAGER,
                    notes: match.notes,
                    currency: match.currency,
                  }
                );
                const newRecord = {
                  at: new Date().toISOString(),
                  ...changedFields,
                };
                history.push(newRecord);
                // Comprimir historial para evitar QuotaExceededError
                const compressedHistory = compressAuditHistory(history);
                return {
                  ...e,
                  paymentType: match.paymentType,
                  amountEgreso: match.amountEgreso,
                  amountIngreso: match.amountIngreso,
                  breakdown: match.breakdown ?? e.breakdown,
                  notes: match.notes,
                  createdAt: match.createdAt,
                  manager: AUTO_ADJUSTMENT_MANAGER,
                  isAudit: true,
                  originalEntryId: e.originalEntryId ?? e.id,
                  auditDetails: JSON.stringify({ history: compressedHistory }),
                } as FondoEntry;
              }
              return e;
            });
            // If some newMovements have no existing entry, prepend them
            newMovements.forEach((nm) => {
              const exists = updated.some(
                (u) =>
                  u.originalEntryId === record.id &&
                  u.currency === nm.currency &&
                  isAutoAdjustmentProvider(u.providerCode)
              );
              if (!exists) {
                updated.unshift(nm);
              }
            });
            console.info(
              "[FG-DEBUG] Updated fondoEntries count after merge:",
              updated.length
            );
            return updated;
          });
        } else {
          // Prepend so the most recent movement appears first (consistent with createdAt)
          console.info(
            "[FG-DEBUG] Prepending new adjustment movements",
            newMovements
          );
          setFondoEntries((prev) => {
            const next = [...newMovements, ...prev];
            console.info(
              "[FG-DEBUG] fondoEntries count after prepend:",
              next.length
            );
            return next;
          });

          // Persistencia: ya se hizo vía persistMovementToFirestore (incluye subcolección v2 + documento principal)
        }

        // Build a human-readable summary of the adjustments we just applied
        try {
          const addedParts: string[] = newMovements.map((m) => {
            const amt = (m.amountIngreso || 0) - (m.amountEgreso || 0);
            const sign = amt >= 0 ? "+" : "-";
            return `${m.currency} ${sign} ${formatByCurrency(
              m.currency as "CRC" | "USD",
              Math.abs(amt)
            )}`;
          });
          const note = `Ajustes aplicados: ${addedParts.join(" / ")}`;

          // Compute the net added contribution by currency and the previous contribution
          const totalNewCRC = newMovements.reduce(
            (s, m) =>
              s +
              (m.currency === "CRC"
                ? (m.amountIngreso || 0) - (m.amountEgreso || 0)
                : 0),
            0
          );
          const totalNewUSD = newMovements.reduce(
            (s, m) =>
              s +
              (m.currency === "USD"
                ? (m.amountIngreso || 0) - (m.amountEgreso || 0)
                : 0),
            0
          );

          // compute existing previous contribution linked to this closing (before we mutate fondoEntries)
          const prevCRCContributionExisting = fondoEntries.reduce(
            (s, e) =>
              s +
              (e.originalEntryId === record.id &&
                isAutoAdjustmentProvider(e.providerCode) &&
                e.currency === "CRC"
                ? (e.amountIngreso || 0) - (e.amountEgreso || 0)
                : 0),
            0
          );
          const prevUSDContributionExisting = fondoEntries.reduce(
            (s, e) =>
              s +
              (e.originalEntryId === record.id &&
                isAutoAdjustmentProvider(e.providerCode) &&
                e.currency === "USD"
                ? (e.amountIngreso || 0) - (e.amountEgreso || 0)
                : 0),
            0
          );

          // New recorded balance = currentBalance (which includes existing adjustments) - prevExisting + newAdded
          const postAdjustmentBalanceCRC = Math.trunc(
            currentBalanceCRC - prevCRCContributionExisting + totalNewCRC
          );
          const postAdjustmentBalanceUSD = Math.trunc(
            currentBalanceUSD - prevUSDContributionExisting + totalNewUSD
          );
          const hasCRCAdjustments =
            totalNewCRC !== 0 || prevCRCContributionExisting !== 0;
          const hasUSDAdjustments =
            totalNewUSD !== 0 || prevUSDContributionExisting !== 0;

          // Persist a readable note and store the balance after adjustments under adjustmentResolution
          setDailyClosings((prevClosings) => {
            const updated = prevClosings.map((d) => {
              if (d.id !== record.id) return d;
              const existingResolution = d.adjustmentResolution || {};
              const updatedResolution: DailyClosingRecord["adjustmentResolution"] =
              {
                ...(existingResolution.removedAdjustments
                  ? {
                    removedAdjustments:
                      existingResolution.removedAdjustments,
                  }
                  : {}),
                note,
                ...(hasCRCAdjustments ? { postAdjustmentBalanceCRC } : {}),
                ...(hasUSDAdjustments ? { postAdjustmentBalanceUSD } : {}),
              };
              return {
                ...d,
                adjustmentResolution: updatedResolution,
              } as DailyClosingRecord;
            });

            try {
              const updatedRecord = updated.find((d) => d.id === record.id);
              if (updatedRecord && normalizedCompany.length > 0) {
                // Fire-and-forget save for adjustment notes (non-critical)
                void DailyClosingsService.saveClosing(
                  normalizedCompany,
                  updatedRecord
                ).then(() => {
                  console.log(`[CIERRE] ✅ Nota de ajuste guardada exitosamente. ID: ${updatedRecord.id}`);
                }).catch((saveErr) => {
                  console.error(
                    "[CIERRE] ❌ Error saving daily closing with adjustment note:",
                    saveErr
                  );
                });
              }
            } catch (saveErr) {
              console.error(
                "[CIERRE] ❌ Error persisting daily closing adjustment note:",
                saveErr
              );
            }

            return updated;
          });
        } catch (noteErr) {
          console.error("Error building/persisting adjustment note:", noteErr);
        }
      }
    } catch (err) {
      console.error(
        "Error creating movement(s) for daily closing difference:",
        err
      );
    }

    // Show toast: success when no diffs, warning when there are diffs
    try {
      const crcDiff = record.diffCRC ?? 0;
      const usdDiff = record.diffUSD ?? 0;
      if (crcDiff === 0 && usdDiff === 0) {
        try {
          showToast("Cierre completo — sin diferencias", "success", 4000);
        } catch {
          // swallow toast errors to avoid breaking flow
        }
      } else {
        try {
          const parts: string[] = [];
          if (crcDiff !== 0)
            parts.push(`CRC ${formatDailyClosingDiff("CRC", crcDiff)}`);
          if (usdDiff !== 0)
            parts.push(`USD ${formatDailyClosingDiff("USD", usdDiff)}`);
          const message = `Cierre con diferencias — ${parts.join(" / ")}`;
          showToast(message, "warning", 6000);
        } catch {
          // swallow toast errors
        }
      }
    } catch {
      // defensive: ignore
    }

    // Actualizar lockedUntil DESPUÉS de agregar todos los movimientos
    // para que persistEntries tenga el estado completo
    // Solo actualizar si no es edición de un cierre existente
    if (!editingDailyClosingId && storageSnapshotRef.current) {
      if (!storageSnapshotRef.current.state) {
        storageSnapshotRef.current.state =
          MovimientosFondosService.createEmptyMovementStorage<FondoEntry>(
            company
          ).state;
      }
      // Bloquear hasta la fecha de creación del cierre
      storageSnapshotRef.current.state.lockedUntil = createdAt;

      // Persistir inmediatamente para asegurar que se guarde incluso sin movimientos
      const normalizedCompany = (company || "").trim();
      if (normalizedCompany.length > 0) {
        const companyKey =
          MovimientosFondosService.buildCompanyMovementsKey(normalizedCompany);
        try {
          // Actualizar localStorage
          localStorage.setItem(
            companyKey,
            JSON.stringify(storageSnapshotRef.current)
          );

          // Actualizar Firestore
          void MovimientosFondosService.saveDocument(
            companyKey,
            storageSnapshotRef.current
          )
            .then(() =>
              console.log("[LOCK-DEBUG] Force saved to Firestore after closing")
            )
            .catch((err) => {
              console.error(
                "Error force saving lockedUntil to Firestore:",
                err
              );
            });
        } catch (err) {
          console.error("Error force persisting lockedUntil:", err);
        }
      }
    }

    // Reset editing state after confirm
    setEditingDailyClosingId(null);
    setDailyClosingInitialValues(null);
  };

  const handleAdminCompanyChange = useCallback(
    (value: string) => {
      if (!canSelectCompany) return;
      const previousValue = adminCompany;
      setAdminCompany(value);
      try {
        localStorage.setItem(SHARED_COMPANY_STORAGE_KEY, value);
        // Disparar evento de storage manualmente para sincronizar dentro de la misma ventana
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: SHARED_COMPANY_STORAGE_KEY,
            newValue: value,
            oldValue: previousValue,
            storageArea: localStorage,
          })
        );
      } catch (error) {
        console.error("Error saving selected company to localStorage:", error);
      }
      setEntriesHydrated(false);
      setHydratedCompany("");
      setFondoEntries([]);
      storageSnapshotRef.current = null;
      setInitialAmount("0");
      setInitialAmountUSD("0");
      setDailyClosingsHydrated(false);
      setDailyClosings([]);
      setDailyClosingsRefreshing(false);
      dailyClosingsRequestCountRef.current = 0;
      loadedDailyClosingKeysRef.current = new Set();
      loadingDailyClosingKeysRef.current = new Set();
      setCurrencyEnabled({ CRC: true, USD: true });
      setMovementModalOpen(false);
      resetFondoForm();
      setMovementAutoCloseLocked(false);
      setSelectedProvider("");
      // Solo resetear filtros si no está activo keepFiltersAcrossCompanies
      if (!keepFiltersAcrossCompanies) {
        const todayKey = dateKeyFromDate(new Date());
        setFilterProviderCode("all");
        setFilterPaymentType(
          mode === "all"
            ? "all"
            : mode === "ingreso"
              ? FONDO_INGRESO_TYPES[0]
              : FONDO_EGRESO_TYPES[0]
        );
        setFilterEditedOnly(false);
        setSearchQuery("");
        setFromFilter(todayKey);
        setToFilter(todayKey);
        setQuickRange("today");
      }
      setPageIndex(0);
    },
    [
      canSelectCompany,
      mode,
      resetFondoForm,
      adminCompany,
      keepFiltersAcrossCompanies,
    ]
  );

  // Escuchar cambios de empresa desde ProviderSection (sincronización bidireccional)
  useEffect(() => {
    if (!canSelectCompany) return;

    const handleStorageChange = (event: StorageEvent) => {
      if (
        event.key === SHARED_COMPANY_STORAGE_KEY &&
        event.newValue &&
        event.newValue !== adminCompany
      ) {
        setAdminCompany(event.newValue);
        // Reset state when company changes from external source
        setEntriesHydrated(false);
        setHydratedCompany("");
        setFondoEntries([]);
        storageSnapshotRef.current = null;
        setInitialAmount("0");
        setInitialAmountUSD("0");
        setDailyClosingsHydrated(false);
        setDailyClosings([]);
        setDailyClosingsRefreshing(false);
        dailyClosingsRequestCountRef.current = 0;
        loadedDailyClosingKeysRef.current = new Set();
        loadingDailyClosingKeysRef.current = new Set();
        setCurrencyEnabled({ CRC: true, USD: true });
        setMovementModalOpen(false);
        resetFondoForm();
        setMovementAutoCloseLocked(false);
        setSelectedProvider("");
        // Solo resetear filtros si no está activo keepFiltersAcrossCompanies
        if (!keepFiltersAcrossCompanies) {
          const todayKey = dateKeyFromDate(new Date());
          setFilterProviderCode("all");
          setFilterPaymentType(
            mode === "all"
              ? "all"
              : mode === "ingreso"
                ? FONDO_INGRESO_TYPES[0]
                : FONDO_EGRESO_TYPES[0]
          );
          setFilterEditedOnly(false);
          setSearchQuery("");
          setFromFilter(todayKey);
          setToFilter(todayKey);
          setQuickRange("today");
        }
        setPageIndex(0);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [
    canSelectCompany,
    adminCompany,
    mode,
    resetFondoForm,
    keepFiltersAcrossCompanies,
  ]);

  const handleFondoKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSubmitFondo();
    }
  };

  const displayedEntries = useMemo(
    () => (sortAsc ? [...fondoEntries].slice().reverse() : fondoEntries),
    [fondoEntries, sortAsc]
  );

  // days that have at least one movement (used to enable/disable dates in the calendar)
  const daysWithMovements = useMemo(() => {
    const s = new Set<string>();
    fondoEntries.forEach((entry) => {
      const d = new Date(entry.createdAt);
      if (!Number.isNaN(d.getTime())) s.add(dateKeyFromDate(d));
    });
    return s;
  }, [fondoEntries]);

  // Apply all active filters to displayedEntries: date range, provider, type, manager, edited-only and free-text search
  const filteredEntries = useMemo(() => {
    let base = displayedEntries.slice();

    // date filtering (from/to)
    if (fromFilter || toFilter) {
      base = base.filter((entry) => {
        const key = dateKeyFromDate(new Date(entry.createdAt));
        if (fromFilter && toFilter) return key >= fromFilter && key <= toFilter;
        if (fromFilter && !toFilter) return key === fromFilter;
        if (!fromFilter && toFilter) return key === toFilter;
        return true;
      });
    }

    // restrict by tab mode (ingreso/egreso) when applicable
    if (mode === "ingreso") {
      base = base.filter((e) => isIngresoType(e.paymentType));
    } else if (mode === "egreso") {
      base = base.filter((e) => isEgresoType(e.paymentType));
    }

    // provider filter
    if (filterProviderCode && filterProviderCode !== "all") {
      base = base.filter((e) => e.providerCode === filterProviderCode);
    }

    // payment type filter
    if (filterPaymentType && filterPaymentType !== "all") {
      base = base.filter((e) => e.paymentType === filterPaymentType);
    }

    // manager filter - not enabled in UI currently

    // edited only
    if (filterEditedOnly) {
      base = base.filter((e) => !!e.isAudit);
    }

    // search across invoice, notes, provider name and manager
    const q = searchQuery.trim().toLowerCase();
    if (q.length > 0) {
      base = base.filter((e) => {
        const provName = providersMap.get(e.providerCode) ?? "";
        return (
          String(e.invoiceNumber).toLowerCase().includes(q) ||
          String(e.notes ?? "")
            .toLowerCase()
            .includes(q) ||
          provName.toLowerCase().includes(q) ||
          String(e.manager ?? "")
            .toLowerCase()
            .includes(q) ||
          String(e.paymentType ?? "")
            .toLowerCase()
            .includes(q)
        );
      });
    }

    return base;
  }, [
    displayedEntries,
    fromFilter,
    toFilter,
    filterProviderCode,
    filterPaymentType,
    filterEditedOnly,
    searchQuery,
    providersMap,
    mode,
  ]);

  const earliestEntryKey = useMemo<string | null>(() => {
    let earliest: string | null = null;
    filteredEntries.forEach((entry) => {
      const date = new Date(entry.createdAt);
      if (Number.isNaN(date.getTime())) return;
      const key = dateKeyFromDate(date);
      if (!earliest || key < earliest) earliest = key;
    });
    return earliest;
  }, [filteredEntries]);

  const totalPages = useMemo(() => {
    if (pageSize === "all" || pageSize === "daily") return 1;
    return Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  }, [filteredEntries.length, pageSize]);

  useEffect(() => {
    // clamp pageIndex when entries or pageSize change
    setPageIndex((prev) => Math.min(prev, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  useEffect(() => {
    if (pageSize === "daily") {
      setPageIndex(0);
      setCurrentDailyKey(todayKey);
      return;
    }
    // whenever user changes pageSize, reset to first page
    setPageIndex(0);
  }, [pageSize, todayKey]);

  const paginatedEntries = useMemo(() => {
    if (pageSize === "all") return filteredEntries;
    if (pageSize === "daily") {
      return filteredEntries.filter(
        (entry) =>
          dateKeyFromDate(new Date(entry.createdAt)) === currentDailyKey
      );
    }
    const start = pageIndex * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, pageIndex, pageSize, currentDailyKey]);

  const isDailyMode = pageSize === "daily";

  const shiftDateKey = useCallback((key: string, delta: number) => {
    const [yearStr, monthStr, dayStr] = key.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day)
    )
      return key;
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + delta);
    return dateKeyFromDate(date);
  }, []);

  const disablePrevButton = isDailyMode
    ? currentDailyKey <= "1970-01-01"
    : pageIndex <= 0;
  const disableNextButton = isDailyMode
    ? currentDailyKey >= todayKey
    : pageIndex >= totalPages - 1;

  const handlePrevPage = useCallback(() => {
    if (isDailyMode) {
      setCurrentDailyKey((prev) => {
        if (prev <= "1970-01-01") return "1970-01-01";
        return shiftDateKey(prev, -1);
      });
      return;
    }
    setPageIndex((p) => Math.max(0, p - 1));
  }, [isDailyMode, shiftDateKey]);

  const handleNextPage = useCallback(() => {
    if (isDailyMode) {
      setCurrentDailyKey((prev) => {
        if (prev >= todayKey) return todayKey;
        const shifted = shiftDateKey(prev, 1);
        return shifted > todayKey ? todayKey : shifted;
      });
      return;
    }
    setPageIndex((p) => Math.min(totalPages - 1, p + 1));
  }, [isDailyMode, shiftDateKey, todayKey, totalPages]);

  // Group visible entries by day (local date). We'll render a date header row per group.
  const groupedByDay = useMemo(() => {
    const map = new Map<string, FondoEntry[]>();
    paginatedEntries.forEach((entry) => {
      const d = new Date(entry.createdAt);
      // use local date key YYYY-MM-DD
      const key =
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0");
      const arr = map.get(key) ?? [];
      arr.push(entry);
      map.set(key, arr);
    });
    return map;
  }, [paginatedEntries]);

  const dateOnlyFormatter = useMemo(
    () => new Intl.DateTimeFormat("es-CR", { dateStyle: "medium" }),
    []
  );
  const formatGroupLabel = (isoDateKey: string) => {
    const [y, m, d] = isoDateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    // Always show the formatted local date (no 'Hoy' / 'Ayer' labels)
    return dateOnlyFormatter.format(date);
  };

  const formatKeyToDisplay = (isoDateKey: string | null) => {
    if (!isoDateKey) return "dd/mm/yyyy";
    const [y, m, d] = isoDateKey.split("-").map(Number);
    const dd = String(d).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const yyyy = String(y);
    return `${dd}/${mm}/${yyyy}`;
  };

  const closingsAreLoading =
    accountKey === "FondoGeneral" &&
    (!dailyClosingsHydrated || dailyClosingsRefreshing);

  const isFondoMovementsLoading = useMemo(() => {
    return Boolean(company) && (!entriesHydrated || movementsLoading);
  }, [company, entriesHydrated, movementsLoading]);
  const visibleDailyClosings = useMemo(() => {
    if (accountKey !== "FondoGeneral") return [] as DailyClosingRecord[];
    if (!dailyClosingsHydrated) return [] as DailyClosingRecord[];
    let base = dailyClosings;
    if (isDailyMode) {
      base = base.filter((record) => {
        const key = dateKeyFromDate(new Date(record.closingDate));
        return key === currentDailyKey;
      });
    } else if (fromFilter || toFilter) {
      base = base.filter((record) => {
        const key = dateKeyFromDate(new Date(record.closingDate));
        if (fromFilter && toFilter) return key >= fromFilter && key <= toFilter;
        if (fromFilter && !toFilter) return key === fromFilter;
        if (!fromFilter && toFilter) return key === toFilter;
        return true;
      });
    }
    return base;
  }, [
    accountKey,
    dailyClosings,
    dailyClosingsHydrated,
    isDailyMode,
    currentDailyKey,
    fromFilter,
    toFilter,
  ]);

  // Totals computed from the filtered entries (not only the current page)
  const isFilterActive = useMemo(() => {
    return Boolean(
      fromFilter ||
      toFilter ||
      (filterProviderCode && filterProviderCode !== "all") ||
      (filterPaymentType && filterPaymentType !== "all") ||
      filterEditedOnly ||
      (searchQuery || "").trim().length > 0
    );
  }, [
    fromFilter,
    toFilter,
    filterProviderCode,
    filterPaymentType,
    filterEditedOnly,
    searchQuery,
  ]);

  const isSingleDayFilter = useMemo(() => {
    return Boolean(fromFilter && toFilter && fromFilter === toFilter);
  }, [fromFilter, toFilter]);

  // Keep superadmin totals collapsed by default per-day.
  useEffect(() => {
    if (!isSuperAdminUser) return;
    if (!isSingleDayFilter) {
      setSuperAdminTotalsOpen(false);
      return;
    }
    setSuperAdminTotalsOpen(false);
  }, [isSuperAdminUser, isSingleDayFilter, fromFilter]);

  const totalsByCurrency = useMemo(() => {
    const acc: Record<"CRC" | "USD", { ingreso: number; egreso: number }> = {
      CRC: { ingreso: 0, egreso: 0 },
      USD: { ingreso: 0, egreso: 0 },
    };
    for (const e of filteredEntries) {
      const cur = (e.currency as "CRC" | "USD") || "CRC";
      const ing = Math.trunc(e.amountIngreso || 0);
      const eg = Math.trunc(e.amountEgreso || 0);
      if (ing > 0) acc[cur].ingreso += ing;
      if (eg > 0) acc[cur].egreso += eg;
    }
    return acc;
  }, [filteredEntries]);

  const companySelectId = `fg-company-select-${namespace}`;
  const showCompanySelector =
    canSelectCompany &&
    (ownerCompaniesLoading ||
      sortedOwnerCompanies.length > 0 ||
      !!ownerCompaniesError);
  const currentCompanyLabel = company || "Sin empresa seleccionada";
  const companySelectorContent = useMemo(() => {
    if (!showCompanySelector) return null;

    const getCompanyKey = (emp: Empresas) =>
      String(emp?.name || emp?.ubicacion || emp?.id || "").trim();
    const getCompanyLabel = (emp: Empresas) => {
      const name = String(emp?.name || "").trim();
      const ubicacion = String(emp?.ubicacion || "").trim();
      if (name && ubicacion && name.toLowerCase() !== ubicacion.toLowerCase()) {
        return `${name} (${ubicacion})`;
      }
      return name || ubicacion || getCompanyKey(emp) || "Sin nombre";
    };

    return (
      <div className="flex flex-col gap-2 text-sm text-[var(--foreground)] sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-[180px]">
          <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
            Empresa actual
          </p>
          <p
            className="text-sm font-semibold text-[var(--foreground)] truncate"
            title={currentCompanyLabel}
          >
            {currentCompanyLabel}
          </p>
          {ownerCompaniesError && (
            <p className="text-xs text-red-500 mt-1">{ownerCompaniesError}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
          <label
            htmlFor={companySelectId}
            className="text-xs font-medium text-[var(--muted-foreground)]"
          >
            Seleccionar empresas
          </label>
          <select
            id={companySelectId}
            value={company}
            onChange={(e) => handleAdminCompanyChange(e.target.value)}
            disabled={
              ownerCompaniesLoading || sortedOwnerCompanies.length === 0
            }
            className="min-w-[220px] px-3 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm text-[var(--foreground)]"
          >
            {ownerCompaniesLoading && (
              <option value="">Cargando empresas...</option>
            )}
            {!ownerCompaniesLoading && sortedOwnerCompanies.length === 0 && (
              <option value="">Sin empresas disponibles</option>
            )}
            {!ownerCompaniesLoading && sortedOwnerCompanies.length > 0 && (
              <>
                <option value="" disabled>
                  Selecciona una empresa
                </option>
                {sortedOwnerCompanies.map((emp, index) => (
                  <option
                    key={emp.id || emp.name || emp.ubicacion || `company-${index}`}
                    value={getCompanyKey(emp)}
                  >
                    {getCompanyLabel(emp)}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
      </div>
    );
  }, [
    showCompanySelector,
    currentCompanyLabel,
    ownerCompaniesError,
    companySelectId,
    company,
    ownerCompaniesLoading,
    sortedOwnerCompanies,
    handleAdminCompanyChange,
  ]);

  useEffect(() => {
    if (!onCompanySelectorChange) return;
    if (companySelectorPlacement === "external") {
      onCompanySelectorChange(companySelectorContent);
      return () => onCompanySelectorChange(null);
    }
    onCompanySelectorChange(null);
  }, [
    companySelectorPlacement,
    companySelectorContent,
    onCompanySelectorChange,
  ]);

  if (authLoading) {
    return (
      <div id={id} className="mt-6">
        <div className="p-6 bg-[var(--card-bg)] border border-[var(--input-border)] rounded text-center">
          <p className="text-[var(--muted-foreground)]">Cargando permisos...</p>
        </div>
      </div>
    );
  }

  if (!canAccessSection) {
    return (
      <div id={id} className="mt-6">
        <AccessRestrictedMessage
          description={`No tienes permisos para acceder a ${namespaceDescription}.`}
        />
      </div>
    );
  }

  if (!fondoTypesLoaded) {
    return (
      <div id={id} className="mt-6">
        <div className="p-8 bg-[var(--card-bg)] border border-[var(--input-border)] rounded text-center space-y-3">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent)]"></div>
          </div>
          <p className="text-[var(--muted-foreground)]">
            Cargando tipos de movimientos...
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Esto solo ocurre la primera vez
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      id={id}
      className="mt-3 sm:mt-4 lg:mt-6 w-full max-w-7xl space-y-3 sm:space-y-4 lg:space-y-6 mx-auto px-0"
    >
      {companySelectorPlacement === "content" && companySelectorContent && (
        <div className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--card-bg)]/70 p-3 sm:p-4">
          {companySelectorContent}
        </div>
      )}

      <section className="w-full rounded-lg border border-[var(--input-border)] bg-[var(--card-bg)]/70 p-2 sm:p-3 md:p-4 space-y-3 sm:space-y-4">
        <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div className="relative">
            <input
              value={providerFilter}
              onChange={(e) => {
                setProviderFilter(e.target.value);
                setIsProviderDropdownOpen(true);
              }}
              onFocus={() => setIsProviderDropdownOpen(true)}
              onBlur={() => {
                setTimeout(() => setIsProviderDropdownOpen(false), 200);
              }}
              className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 pr-8 sm:pr-10 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-xs sm:text-sm text-[var(--muted-foreground)]"
              placeholder={providersLoading ? "Cargando..." : "Proveedor"}
              title="Filtrar por proveedor"
              aria-label="Filtrar por proveedor"
            />
            <Search className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--muted-foreground)]" />
            {isProviderDropdownOpen &&
              (() => {
                const filteredProviders =
                  providerFilter.length === 0
                    ? [
                      { code: "all", name: "Todos los proveedores" },
                      ...providers,
                    ]
                    : [
                      { code: "all", name: "Todos los proveedores" },
                      ...providers.filter(
                        (p) =>
                          p.name
                            .toLowerCase()
                            .includes(providerFilter.toLowerCase()) ||
                          p.code
                            .toLowerCase()
                            .includes(providerFilter.toLowerCase())
                      ),
                    ];
                return filteredProviders.length > 0 ? (
                  <div className="absolute z-10 w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded mt-1 max-h-60 overflow-y-auto shadow-lg">
                    {filteredProviders.map((p) => (
                      <div
                        key={p.code}
                        className="p-2 hover:bg-blue-400 cursor-pointer transition-all duration-200"
                        onMouseDown={() => {
                          setFilterProviderCode(p.code);
                          setProviderFilter(
                            p.code === "all" ? "" : `${p.name} (${p.code})`
                          );
                          setIsProviderDropdownOpen(false);
                        }}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          setFilterProviderCode(p.code);
                          setProviderFilter(
                            p.code === "all" ? "" : `${p.name} (${p.code})`
                          );
                          setIsProviderDropdownOpen(false);
                        }}
                      >
                        {p.code === "all" ? p.name : `${p.name} (${p.code})`}
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
          </div>

          <div className="relative">
            <input
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setIsTypeDropdownOpen(true);
              }}
              onFocus={() => setIsTypeDropdownOpen(true)}
              onBlur={() => {
                setTimeout(() => setIsTypeDropdownOpen(false), 200);
              }}
              className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 pr-8 sm:pr-10 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-xs sm:text-sm text-[var(--muted-foreground)]"
              placeholder="Tipo movimiento"
              title="Filtrar por tipo"
              aria-label="Filtrar por tipo"
            />
            <Search className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--muted-foreground)]" />
            {isTypeDropdownOpen &&
              (() => {
                const allTypes: Array<{
                  value: string;
                  label: string;
                  group: string;
                }> = [
                    { value: "all", label: "Todos los tipos", group: "" },
                    ...FONDO_INGRESO_TYPES.map((t) => ({
                      value: t,
                      label: formatMovementType(t),
                      group: "Ingresos",
                    })),
                    ...FONDO_GASTO_TYPES.map((t) => ({
                      value: t,
                      label: formatMovementType(t),
                      group: "Gastos",
                    })),
                    ...FONDO_EGRESO_TYPES.map((t) => ({
                      value: t,
                      label: formatMovementType(t),
                      group: "Egresos",
                    })),
                  ];
                const filteredTypes =
                  typeFilter.length === 0
                    ? allTypes
                    : allTypes.filter(
                      (t) =>
                        t.label
                          .toLowerCase()
                          .includes(typeFilter.toLowerCase()) ||
                        t.value
                          .toLowerCase()
                          .includes(typeFilter.toLowerCase())
                    );
                if (filteredTypes.length === 0) return null;

                const groupedTypes = filteredTypes.reduce((acc, type) => {
                  const group = type.group || "general";
                  if (!acc[group]) acc[group] = [];
                  acc[group].push(type);
                  return acc;
                }, {} as Record<string, typeof filteredTypes>);

                return (
                  <div className="absolute z-10 w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded mt-1 max-h-60 overflow-y-auto shadow-lg">
                    {Object.entries(groupedTypes).map(([group, types]) => (
                      <React.Fragment key={group}>
                        {group !== "general" && (
                          <div className="px-3 py-1 text-xs font-semibold text-[var(--muted-foreground)] bg-[var(--muted)] uppercase">
                            {group}
                          </div>
                        )}
                        {types.map((t) => (
                          <div
                            key={t.value}
                            className="p-2 hover:bg-blue-400 cursor-pointer transition-all duration-200"
                            onMouseDown={() => {
                              setFilterPaymentType(t.value as any);
                              setTypeFilter(t.value === "all" ? "" : t.label);
                              setIsTypeDropdownOpen(false);
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault();
                              setFilterPaymentType(t.value as any);
                              setTypeFilter(t.value === "all" ? "" : t.label);
                              setIsTypeDropdownOpen(false);
                            }}
                          >
                            {t.label}
                          </div>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                );
              })()}
          </div>

          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar factura, notas..."
            className="w-full px-2.5 sm:px-3 py-1.5 sm:py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-xs sm:text-sm text-[var(--muted-foreground)]"
            aria-label="Buscar movimientos"
          />

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 rounded border border-dashed border-[var(--input-border)] px-2.5 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-[var(--muted-foreground)]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <div>
                <label className="flex items-center gap-1.5 sm:gap-2">
                  <input
                    type="checkbox"
                    checked={filterEditedOnly}
                    onChange={(e) => setFilterEditedOnly(e.target.checked)}
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                  />
                  <span>Editados</span>
                </label>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFilterProviderCode("all");
                  setFilterPaymentType("all");
                  setFilterEditedOnly(false);
                  setSearchQuery("");
                  setFromFilter(null);
                  setToFilter(null);
                  setQuickRange(null);

                  setCalendarFromOpen(false);
                  setCalendarToOpen(false);
                  const m = new Date();
                  m.setDate(1);
                  m.setHours(0, 0, 0, 0);
                  setCalendarFromMonth(new Date(m));
                  setCalendarToMonth(new Date(m));

                  setPageSize("daily");
                  setPageIndex(0);
                }}
                className="self-start sm:self-center px-2.5 sm:px-3 py-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wide border border-[var(--input-border)] rounded hover:bg-[var(--muted)] transition-colors"
                title="Limpiar filtros"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-2 sm:gap-3 border-t border-[var(--input-border)] pt-2 sm:pt-3">
          <div className="flex flex-col sm:flex-row flex-1 flex-wrap items-start sm:items-center gap-2 sm:gap-3 w-full sm:w-auto sm:min-w-[260px]">
            <div className="relative w-full sm:w-auto flex-1 sm:flex-initial min-w-[140px] sm:min-w-[160px]">
              <label className="block text-[10px] sm:text-xs font-medium text-[var(--muted-foreground)] mb-0.5 sm:mb-1">
                Desde
              </label>
              <button
                type="button"
                ref={fromButtonRef}
                onClick={() => setCalendarFromOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 border border-[var(--input-border)] rounded hover:bg-[var(--muted)] bg-transparent text-[var(--muted-foreground)] transition-colors"
                title="Seleccionar fecha desde"
                aria-label="Seleccionar fecha desde"
              >
                <span className="text-xs sm:text-sm font-medium truncate">
                  {fromFilter ? formatKeyToDisplay(fromFilter) : "dd/mm/yyyy"}
                </span>
                <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              </button>

              {calendarFromOpen && (
                <div
                  ref={fromCalendarRef}
                  className="absolute left-0 top-full mt-1 sm:mt-2 z-50 w-full min-w-[280px] sm:w-72"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-full rounded border border-[var(--input-border)] bg-[#1f262a] p-2 sm:p-3 text-white shadow-lg">
                    <div className="mb-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          const m = new Date(calendarFromMonth);
                          m.setMonth(m.getMonth() - 1);
                          setCalendarFromMonth(new Date(m));
                        }}
                        className="p-1 rounded hover:bg-[var(--muted)]"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="text-sm font-semibold capitalize">
                        {calendarFromMonth.toLocaleString("es-CR", {
                          month: "long",
                          year: "numeric",
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const m = new Date(calendarFromMonth);
                          m.setMonth(m.getMonth() + 1);
                          setCalendarFromMonth(new Date(m));
                        }}
                        className="p-1 rounded hover:bg-[var(--muted)]"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-center text-xs text-[var(--muted-foreground)]">
                      {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
                        <div key={`${d}-${i}`} className="py-1">
                          {d}
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 grid grid-cols-7 gap-1 text-sm">
                      {(() => {
                        const cells: React.ReactNode[] = [];
                        const year = calendarFromMonth.getFullYear();
                        const month = calendarFromMonth.getMonth();
                        const first = new Date(year, month, 1);
                        const start = first.getDay();
                        const daysInMonth = new Date(
                          year,
                          month + 1,
                          0
                        ).getDate();

                        for (let i = 0; i < start; i++)
                          cells.push(<div key={`pad-f-${i}`} />);

                        for (let day = 1; day <= daysInMonth; day++) {
                          const d = new Date(year, month, day);
                          const key = dateKeyFromDate(d);
                          const enabled = key <= todayKey;
                          const isSelected = fromFilter === key;
                          if (enabled) {
                            cells.push(
                              <button
                                key={key}
                                type="button"
                                onClick={() => {
                                  setQuickRange(null);
                                  setFromFilter(key);
                                  setCalendarFromOpen(false);
                                  setPageSize("all");
                                  setPageIndex(0);
                                }}
                                className={`py-1 rounded ${isSelected
                                  ? "bg-[var(--accent)] text-white"
                                  : "hover:bg-[var(--muted)]"
                                  }`}
                              >
                                {day}
                              </button>
                            );
                          } else {
                            cells.push(
                              <div
                                key={key}
                                className="py-1 text-[var(--muted-foreground)] opacity-60"
                              >
                                {day}
                              </div>
                            );
                          }
                        }
                        return cells;
                      })()}
                    </div>

                    <div className="mt-3 flex justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          const todayKey = dateKeyFromDate(new Date());
                          setQuickRange(null);
                          setFromFilter(todayKey);
                          setCalendarFromOpen(false);
                        }}
                        className="px-2 py-1 rounded border border-[var(--input-border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                      >
                        Limpiar
                      </button>
                      <button
                        type="button"
                        onClick={() => setCalendarFromOpen(false)}
                        className="px-2 py-1 rounded border border-[var(--input-border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="relative w-full sm:w-auto">
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
                Hasta
              </label>
              <button
                type="button"
                ref={toButtonRef}
                onClick={() => setCalendarToOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 border border-[var(--input-border)] rounded hover:bg-[var(--muted)] bg-transparent text-[var(--muted-foreground)]"
                title="Seleccionar fecha hasta"
                aria-label="Seleccionar fecha hasta"
              >
                <span className="text-sm font-medium">
                  {toFilter ? formatKeyToDisplay(toFilter) : "dd/mm/yyyy"}
                </span>
                <CalendarDays className="w-4 h-4" />
              </button>

              {calendarToOpen && (
                <div
                  ref={toCalendarRef}
                  className="absolute left-0 top-full mt-2 z-50 w-full sm:w-64"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-full rounded border border-[var(--input-border)] bg-[#1f262a] p-3 text-white shadow-lg">
                    <div className="mb-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          const m = new Date(calendarToMonth);
                          m.setMonth(m.getMonth() - 1);
                          setCalendarToMonth(new Date(m));
                        }}
                        className="p-1 rounded hover:bg-[var(--muted)]"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="text-sm font-semibold capitalize">
                        {calendarToMonth.toLocaleString("es-CR", {
                          month: "long",
                          year: "numeric",
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const m = new Date(calendarToMonth);
                          m.setMonth(m.getMonth() + 1);
                          setCalendarToMonth(new Date(m));
                        }}
                        className="p-1 rounded hover:bg-[var(--muted)]"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-center text-xs text-[var(--muted-foreground)]">
                      {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
                        <div key={`${d}-${i}`} className="py-1">
                          {d}
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 grid grid-cols-7 gap-1 text-sm">
                      {(() => {
                        const cells: React.ReactNode[] = [];
                        const year = calendarToMonth.getFullYear();
                        const month = calendarToMonth.getMonth();
                        const first = new Date(year, month, 1);
                        const start = first.getDay();
                        const daysInMonth = new Date(
                          year,
                          month + 1,
                          0
                        ).getDate();

                        for (let i = 0; i < start; i++)
                          cells.push(<div key={`pad-t-${i}`} />);

                        for (let day = 1; day <= daysInMonth; day++) {
                          const d = new Date(year, month, day);
                          const key = dateKeyFromDate(d);
                          const enabled = key <= todayKey;
                          const isSelected = toFilter === key;
                          if (enabled) {
                            cells.push(
                              <button
                                key={key}
                                type="button"
                                onClick={() => {
                                  setQuickRange(null);
                                  setToFilter(key);
                                  setCalendarToOpen(false);
                                  setPageSize("all");
                                  setPageIndex(0);
                                }}
                                className={`py-1 rounded ${isSelected
                                  ? "bg-[var(--accent)] text-white"
                                  : "hover:bg-[var(--muted)]"
                                  }`}
                              >
                                {day}
                              </button>
                            );
                          } else {
                            cells.push(
                              <div
                                key={key}
                                className="py-1 text-[var(--muted-foreground)] opacity-60"
                              >
                                {day}
                              </div>
                            );
                          }
                        }
                        return cells;
                      })()}
                    </div>

                    <div className="mt-3 flex justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          const todayKey = dateKeyFromDate(new Date());
                          setQuickRange(null);
                          setToFilter(todayKey);
                          setCalendarToOpen(false);
                        }}
                        className="px-2 py-1 rounded border border-[var(--input-border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                      >
                        Limpiar
                      </button>
                      <button
                        type="button"
                        onClick={() => setCalendarToOpen(false)}
                        className="px-2 py-1 rounded border border-[var(--input-border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-2">
              <select
                className="border border-[var(--input-border)] rounded px-2 py-1 text-xs sm:text-sm bg-[var(--input-bg)]"
                value={quickRange || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setQuickRange(v || null);
                  const now = new Date();
                  let from: Date | null = null;
                  let to: Date | null = null;
                  if (v === 'today') {
                    const t = new Date(now);
                    from = to = t;
                  } else if (v === 'yesterday') {
                    const y = new Date(now);
                    y.setDate(now.getDate() - 1);
                    from = to = y;
                  } else if (v === 'thisweek') {
                    const day = now.getDay();
                    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Lunes como inicio
                    from = new Date(now.setDate(diff));
                    to = new Date();
                  } else if (v === 'lastweek') {
                    const day = now.getDay();
                    const diff = now.getDate() - day + (day === 0 ? -6 : 1) - 7;
                    from = new Date(now.getFullYear(), now.getMonth(), diff);
                    to = new Date(now.getFullYear(), now.getMonth(), diff + 6);
                  } else if (v === 'lastmonth') {
                    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    const last = new Date(now.getFullYear(), now.getMonth(), 0);
                    from = first;
                    to = last;
                  } else if (v === 'month') {
                    const first = new Date(now.getFullYear(), now.getMonth(), 1);
                    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    from = first;
                    to = last;
                  } else if (v === 'last30') {
                    const last = new Date();
                    const first = new Date();
                    first.setDate(last.getDate() - 29);
                    from = first;
                    to = last;
                  }
                  if (from && to) {
                    setFromFilter(dateKeyFromDate(from));
                    setToFilter(dateKeyFromDate(to));
                    setPageSize("all");
                    setPageIndex(0);
                  }
                }}
              >
                <option value="">Filtro de fecha</option>
                <option value="today">Hoy</option>
                <option value="yesterday">Ayer</option>
                <option value="thisweek">Esta semana</option>
                <option value="lastweek">Semana anterior</option>
                <option value="lastmonth">Mes anterior</option>
                <option value="last30">Últimos 30 días</option>
                <option value="month">Mes actual</option>
              </select>
            </div>
            {accountKey === "FondoGeneral" && (
              <div className="relative group mt-2 sm:mt-0">
                <button
                  type="button"
                  onClick={() => setDailyClosingHistoryOpen(true)}
                  disabled={closingsAreLoading}
                  className="inline-flex items-center justify-center h-8 w-8 rounded border border-[var(--input-border)] bg-[var(--input-bg)] hover:bg-[var(--muted)] transition-colors disabled:opacity-60"
                  title="Cierres anteriores"
                  aria-label="Cierres anteriores"
                >
                  <Clock className="w-4 h-4 text-[var(--muted-foreground)]" />
                </button>
                <div className="hidden sm:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-[var(--card-bg)] border border-[var(--input-border)] text-[var(--foreground)] text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                  Cierres anteriores
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--input-border)]"></div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row w-full sm:w-auto items-stretch sm:items-center gap-2">
            {accountKey === "FondoGeneral" && (
              <div className="relative group flex-1 sm:flex-initial ">
                <button
                  type="button"
                  onClick={handleOpenDailyClosing}
                  disabled={!pendingCierreDeCaja}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 rounded px-3 sm:px-4 py-2 sm:py-2.5 text-white text-xs sm:text-sm w-full ${!pendingCierreDeCaja
                    ? "bg-gray-400 cursor-not-allowed opacity-60"
                    : "fg-add-mov-btn"
                    }`}
                >
                  <Banknote className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="whitespace-nowrap">Registrar cierre</span>
                </button>
                {!pendingCierreDeCaja && (
                  <div className="hidden sm:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-yellow-500 text-black text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                    ⚠️ Debe agregar un movimiento de &quot;CIERRE FONDO
                    VENTAS&quot; primero
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-yellow-500"></div>
                  </div>
                )}
              </div>
            )}
            <div className="relative group flex-1 sm:flex-initial">
              <button
                type="button"
                onClick={handleOpenCreateMovement}
                disabled={
                  (accountKey === "FondoGeneral" && pendingCierreDeCaja) ||
                  !entriesHydrated
                }
                className={`flex items-center justify-center gap-1.5 sm:gap-2 rounded px-3 sm:px-4 py-2 sm:py-2.5 text-white text-xs sm:text-sm w-full ${(accountKey === "FondoGeneral" && pendingCierreDeCaja) ||
                  !entriesHydrated
                  ? "bg-gray-400 cursor-not-allowed opacity-60"
                  : "fg-add-mov-btn"
                  }`}
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="whitespace-nowrap">Agregar movimiento</span>
              </button>
              {accountKey === "FondoGeneral" &&
                pendingCierreDeCaja &&
                entriesHydrated && (
                  <div className="hidden sm:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-yellow-500 text-black text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                    Debe realizar el &quot;Registrar cierre&quot; para seguir
                    agregando movimientos
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-yellow-500"></div>
                  </div>
                )}
            </div>
          </div>
        </div>
      </section>

      {!authLoading && !company && (
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          {canSelectCompany
            ? "Selecciona una empresa para continuar."
            : "Tu usuario no tiene una empresa asociada; registra una empresa para continuar."}
        </p>
      )}

      {providersError && (
        <div className="mb-4 text-sm text-red-500">{providersError}</div>
      )}

      <Drawer
        anchor="right"
        open={movementModalOpen}
        onClose={closeMovementModal}
        PaperProps={{
          sx: {
            width: { xs: "100vw", sm: 520 },
            maxWidth: "100vw",
            bgcolor: "#1f262a",
            color: "#ffffff",
          },
        }}
      >
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              px: 3,
              py: 2,
              position: "relative",
            }}
          >
            <Typography
              variant="h6"
              component="h3"
              sx={{ fontWeight: 600, textAlign: "center", width: "100%" }}
            >
              {editingEntry
                ? `Editar movimiento #${editingEntry.invoiceNumber}`
                : "Registrar movimiento"}
            </Typography>
            <Box
              sx={{
                position: "absolute",
                right: 12,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <IconButton
                aria-label={
                  movementAutoCloseLocked
                    ? "Desbloquear cierre automatico"
                    : "Bloquear cierre automatico"
                }
                onClick={() => setMovementAutoCloseLocked((prev) => !prev)}
                sx={{ color: "var(--foreground)" }}
              >
                {movementAutoCloseLocked ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <LockOpen className="w-4 h-4" />
                )}
              </IconButton>
              <IconButton
                aria-label="Cerrar registro de movimiento"
                onClick={closeMovementModal}
                sx={{ color: "var(--foreground)" }}
              >
                <X className="w-4 h-4" />
              </IconButton>
            </Box>
          </Box>
          <Divider sx={{ borderColor: "var(--input-border)" }} />
          <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 2 }}>
            {editingEntry && (
              <Typography
                variant="caption"
                component="p"
                sx={{ color: "var(--muted-foreground)", mb: 2 }}
              >
                Editando movimiento #{editingEntry.invoiceNumber}. Actualiza los
                datos y presiona &quot;Actualizar&quot; o cancela para volver al
                modo de registro.
              </Typography>
            )}
            <AgregarMovimiento
              selectedProvider={selectedProvider}
              onProviderChange={handleProviderChange}
              providers={providers}
              providersLoading={providersLoading}
              isProviderSelectDisabled={
                isProviderSelectDisabled || isEditingCierreFondoVentas
              }
              providerDisabledTooltip={
                isEditingCierreFondoVentas
                  ? 'No se puede cambiar el proveedor de un movimiento "CIERRE FONDO VENTAS"'
                  : undefined
              }
              selectedProviderExists={selectedProviderExists}
              invoiceNumber={invoiceNumber}
              onInvoiceNumberChange={handleInvoiceNumberChange}
              invoiceValid={invoiceValid}
              invoiceDisabled={invoiceDisabled}
              paymentType={paymentType}
              isEgreso={isEgreso}
              egreso={egreso}
              onEgresoChange={handleEgresoChange}
              egresoBorderClass={egresoBorderClass}
              ingreso={ingreso}
              onIngresoChange={handleIngresoChange}
              ingresoBorderClass={ingresoBorderClass}
              notes={notes}
              onNotesChange={handleNotesChange}
              manager={manager}
              onManagerChange={handleManagerChange}
              managerSelectDisabled={managerSelectDisabled}
              employeeOptions={employeeOptions}
              employeesLoading={employeesLoading}
              editingEntryId={editingEntryId}
              onCancelEditing={cancelEditing}
              onSubmit={handleSubmitFondo}
              isSubmitDisabled={isSubmitDisabled}
              isSaving={isSaving}
              onFieldKeyDown={handleFondoKeyDown}
              currency={movementCurrency}
              onCurrencyChange={(c) => setMovementCurrency(c)}
              currencyEnabled={currencyEnabled}
              providerError={providerError}
              invoiceError={invoiceError}
              amountError={amountError}
              managerError={managerError}
            />
          </Box>
        </Box>
      </Drawer>

      {!providersLoading && providers.length === 0 && company && (
        <p className="text-sm text-[var(--muted-foreground)] mt-3">
          Registra un proveedor para poder asociarlo a los movimientos del
          fondo.
        </p>
      )}

      {!employeesLoading && employeeOptions.length === 0 && company && (
        <p className="text-sm text-[var(--muted-foreground)] mt-2">
          La empresa no tiene empleados registrados; agrega empleados para
          seleccionar un encargado.
        </p>
      )}

      <div className="mt-6">
        <h3 className="text-xs sm:text-sm font-medium text-[var(--muted-foreground)] mb-2 text-center">
          Movimientos recientes
        </h3>
        {fondoEntries.length === 0 ? (
          isFondoMovementsLoading ? (
            <div className="flex flex-col items-center justify-center py-6 text-[var(--muted-foreground)]">
              <div className="h-6 w-6 rounded-full border-2 border-[var(--muted-foreground)] border-t-transparent animate-spin" />
              <p className="mt-2 text-xs sm:text-sm">Cargando movimientos...</p>
            </div>
          ) : (
            <p className="text-xs sm:text-sm text-[var(--muted-foreground)] text-center py-4">
              No hay movimientos aun.
            </p>
          )
        ) : (
          <div className="overflow-x-auto rounded border border-[var(--input-border)] bg-[#1f262a] text-white">
            <div className="px-2 sm:px-3 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 bg-transparent text-xs sm:text-sm text-[var(--muted-foreground)]">
              <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                <span className="text-xs sm:text-sm">Mostrar</span>
                <select
                  value={
                    pageSize === "all"
                      ? "all"
                      : pageSize === "daily"
                        ? "daily"
                        : String(pageSize)
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "all") setPageSize("all");
                    else if (v === "daily") setPageSize("daily");
                    else setPageSize(Number.parseInt(v, 10) || 10);
                  }}
                  className="p-1 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-xs sm:text-sm flex-1 sm:flex-initial min-w-0"
                >
                  <option value="daily">Diariamente</option>
                  <option value="5">5</option>
                  <option value="10">10</option>
                  <option value="15">15</option>
                  <option value="all">Todos</option>
                </select>
                {isFondoMovementsLoading && (
                  <span className="ml-2 inline-flex items-center gap-2 text-[10px] sm:text-xs text-[var(--muted-foreground)]">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-[var(--muted-foreground)] border-t-transparent animate-spin" />
                    Cargando...
                  </span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 text-[var(--muted-foreground)]">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      aria-label="Recordar filtros"
                      title="Recordar filtros"
                      className="cursor-pointer w-3.5 h-3.5 sm:w-4 sm:h-4"
                      type="checkbox"
                      checked={rememberFilters}
                      onChange={(e) => setRememberFilters(e.target.checked)}
                    />
                    <span className="text-xs sm:text-sm whitespace-nowrap">
                      Recordar ajustes
                    </span>
                  </label>
                  {isAdminUser && (
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        aria-label="Mantener filtros entre empresas"
                        title="Mantener filtros entre empresas"
                        className="cursor-pointer w-3.5 h-3.5 sm:w-4 sm:h-4"
                        type="checkbox"
                        checked={keepFiltersAcrossCompanies}
                        onChange={(e) =>
                          setKeepFiltersAcrossCompanies(e.target.checked)
                        }
                      />
                      <span className="text-xs sm:text-sm whitespace-nowrap">
                        Mantener entre empresas
                      </span>
                    </label>
                  )}
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handlePrevPage}
                    disabled={disablePrevButton}
                    className="px-2 sm:px-3 py-1 border border-[var(--input-border)] rounded disabled:opacity-50 text-xs sm:text-sm flex-1 sm:flex-initial"
                  >
                    Ant
                  </button>
                  <div className="px-1 sm:px-2 text-[10px] sm:text-xs whitespace-nowrap">
                    {isDailyMode
                      ? formatGroupLabel(currentDailyKey)
                      : `${Math.min(pageIndex + 1, totalPages)}/${totalPages}`}
                  </div>
                  <button
                    type="button"
                    onClick={handleNextPage}
                    disabled={disableNextButton}
                    className="px-2 sm:px-3 py-1 border border-[var(--input-border)] rounded disabled:opacity-50 text-xs sm:text-sm flex-1 sm:flex-initial"
                  >
                    Sig
                  </button>
                </div>
              </div>
            </div>
            <div className="max-h-[28rem] sm:max-h-[36rem] overflow-y-auto">
              {(fromFilter || toFilter) && (
                <div className="px-2 sm:px-3 py-2">
                  <div className="text-xs sm:text-sm text-[var(--muted-foreground)] flex flex-col sm:flex-row sm:items-center gap-2">
                    <span>
                      Filtro: {fromFilter ? formatGroupLabel(fromFilter) : "—"}
                      {toFilter ? ` → ${formatGroupLabel(toFilter)}` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFromFilter(null);
                        setToFilter(null);
                        setPageIndex(0);
                        setPageSize("daily");
                      }}
                      className="px-2 py-1 border border-[var(--input-border)] rounded text-[var(--muted-foreground)] hover:bg-[var(--muted)] text-xs self-start"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>
              )}
              <table className="w-full min-w-[900px] text-xs sm:text-sm">
                <colgroup>
                  <col style={{ width: columnWidths.hora }} />
                  <col style={{ width: columnWidths.motivo }} />
                  <col style={{ width: columnWidths.tipo }} />
                  <col style={{ width: columnWidths.factura }} />
                  <col style={{ width: columnWidths.monto }} />
                  <col style={{ width: columnWidths.encargado }} />
                  <col style={{ width: columnWidths.editar }} />
                </colgroup>
                <thead className="bg-[var(--muted)] text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">
                      <div className="relative pr-2">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          Hora
                        </div>
                        <div
                          onMouseDown={(e) => startResizing(e, "hora")}
                          className="absolute top-0 right-0 h-full w-8 -mr-3 cursor-col-resize flex items-center justify-center"
                          style={{ touchAction: "none" }}
                        >
                          <div
                            style={{
                              width: 2,
                              height: "70%",
                              background: "rgba(255,255,255,0.18)",
                              borderRadius: 3,
                            }}
                          />
                        </div>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      <div className="relative pr-2">
                        <div className="flex items-center gap-2">
                          <Layers className="w-4 h-4" />
                          Motivo
                        </div>
                        <div
                          onMouseDown={(e) => startResizing(e, "motivo")}
                          className="absolute top-0 right-0 h-full w-8 -mr-3 cursor-col-resize flex items-center justify-center"
                          style={{ touchAction: "none" }}
                        >
                          <div
                            style={{
                              width: 2,
                              height: "70%",
                              background: "rgba(255,255,255,0.18)",
                              borderRadius: 3,
                            }}
                          />
                        </div>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      <div className="relative pr-2">
                        <div className="flex items-center gap-2">
                          <Tag className="w-4 h-4" />
                          Tipo
                        </div>
                        <div
                          onMouseDown={(e) => startResizing(e, "tipo")}
                          className="absolute top-0 right-0 h-full w-8 -mr-3 cursor-col-resize flex items-center justify-center"
                          style={{ touchAction: "none" }}
                        >
                          <div
                            style={{
                              width: 2,
                              height: "70%",
                              background: "rgba(255,255,255,0.18)",
                              borderRadius: 3,
                            }}
                          />
                        </div>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      <div className="relative pr-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          N° factura
                        </div>
                        <div
                          onMouseDown={(e) => startResizing(e, "factura")}
                          className="absolute top-0 right-0 h-full w-8 -mr-3 cursor-col-resize flex items-center justify-center"
                          style={{ touchAction: "none" }}
                        >
                          <div
                            style={{
                              width: 2,
                              height: "70%",
                              background: "rgba(255,255,255,0.18)",
                              borderRadius: 3,
                            }}
                          />
                        </div>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      <div className="relative pr-2">
                        <div className="flex items-center gap-2">
                          <Banknote className="w-4 h-4" />
                          Monto
                        </div>
                        <div
                          onMouseDown={(e) => startResizing(e, "monto")}
                          className="absolute top-0 right-0 h-full w-8 -mr-3 cursor-col-resize flex items-center justify-center"
                          style={{ touchAction: "none" }}
                        >
                          <div
                            style={{
                              width: 2,
                              height: "70%",
                              background: "rgba(255,255,255,0.18)",
                              borderRadius: 3,
                            }}
                          />
                        </div>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      <div className="relative pr-2">
                        <div className="flex items-center gap-2">
                          <UserCircle className="w-4 h-4" />
                          Encargado
                        </div>
                        <div
                          onMouseDown={(e) => startResizing(e, "encargado")}
                          className="absolute top-0 right-0 h-full w-8 -mr-3 cursor-col-resize flex items-center justify-center"
                          style={{ touchAction: "none" }}
                        >
                          <div
                            style={{
                              width: 2,
                              height: "70%",
                              background: "rgba(255,255,255,0.18)",
                              borderRadius: 3,
                            }}
                          />
                        </div>
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left font-semibold">
                      <div className="relative pr-2">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSortAsc((prev: boolean) => !prev)}
                            title={
                              sortAsc
                                ? "Mostrar más reciente arriba"
                                : "Mostrar más reciente abajo"
                            }
                            aria-label="Invertir orden de movimientos"
                            className="p-1 border border-[var(--input-border)] rounded hover:bg-[var(--muted)]"
                          >
                            <ArrowUpDown className="w-4 h-4" />
                          </button>
                        </div>
                        <div
                          onMouseDown={(e) => startResizing(e, "editar")}
                          className="absolute top-0 right-0 h-full w-8 -mr-3 cursor-col-resize flex items-center justify-center"
                          style={{ touchAction: "none" }}
                        >
                          <div
                            style={{
                              width: 2,
                              height: "70%",
                              background: "rgba(255,255,255,0.18)",
                              borderRadius: 3,
                            }}
                          />
                        </div>
                      </div>
                    </th>
                  </tr>
                </thead>
                {Array.from(groupedByDay.entries()).map(([dayKey, entries]) => (
                  <tbody key={dayKey}>
                    {entries.map((fe) => {
                      // the newest entry is the first element in fondoEntries (inserted at index 0)
                      const isMostRecent = fe.id === fondoEntries[0]?.id;
                      const providerName =
                        providersMap.get(fe.providerCode) ?? fe.providerCode;
                      const entryCurrency =
                        (fe.currency as "CRC" | "USD") || "CRC";
                      const normalizedIngreso = Math.trunc(
                        fe.amountIngreso || 0
                      );
                      const normalizedEgreso = Math.trunc(fe.amountEgreso || 0);
                      let isEntryEgreso =
                        isEgresoType(fe.paymentType) ||
                        isGastoType(fe.paymentType);
                      if (normalizedIngreso > 0 && normalizedEgreso === 0) {
                        isEntryEgreso = false;
                      } else if (
                        normalizedEgreso > 0 &&
                        normalizedIngreso === 0
                      ) {
                        isEntryEgreso = true;
                      }
                      const movementAmount = isEntryEgreso
                        ? normalizedEgreso
                        : normalizedIngreso;
                      const balanceAfter =
                        entryCurrency === "USD"
                          ? balanceAfterByIdUSD.get(fe.id) ??
                          Math.trunc(currentBalanceUSD)
                          : balanceAfterByIdCRC.get(fe.id) ??
                          Math.trunc(currentBalanceCRC);
                      // compute the balance immediately before this movement was applied (in the movement currency)
                      const previousBalance = isEntryEgreso
                        ? balanceAfter + normalizedEgreso
                        : balanceAfter - normalizedIngreso;
                      const recordedAt = new Date(fe.createdAt);
                      const formattedDate = Number.isNaN(recordedAt.getTime())
                        ? "Sin fecha"
                        : dateTimeFormatter.format(recordedAt);
                      const isAutoAdjustment = isAutoAdjustmentProvider(
                        fe.providerCode
                      );
                      const isSuccessfulClosing =
                        isAutoAdjustment && movementAmount === 0;
                      const amountPrefix = isEntryEgreso ? "-" : "+";
                      // prepare tooltip text for edited entries
                      let auditTooltip: string | undefined;
                      let parsedAudit: any | null = null;
                      if (fe.isAudit && fe.auditDetails) {
                        try {
                          const parsed = JSON.parse(fe.auditDetails) as any;
                          // normalize to history array for backward compatibility
                          let history: any[] = [];
                          if (Array.isArray(parsed?.history)) {
                            history = parsed.history;
                          } else if (parsed?.before && parsed?.after) {
                            history = [
                              {
                                at: parsed.at ?? fe.createdAt,
                                before: parsed.before,
                                after: parsed.after,
                              },
                            ];
                          }
                          parsedAudit = { history };

                          // build tooltip from accumulated history (show each change timestamp + small summary)
                          const lines: string[] = history.map((h) => {
                            const at = h?.at
                              ? dateTimeFormatter.format(new Date(h.at))
                              : "—";
                            const before = h?.before ?? {};
                            const after = h?.after ?? {};
                            const parts: string[] = [];

                            // Con el nuevo formato simplificado, mostramos todos los campos presentes
                            if (
                              "providerCode" in before ||
                              "providerCode" in after
                            ) {
                              parts.push(
                                `Proveedor: ${before.providerCode ?? "—"} → ${after.providerCode ?? "—"
                                }`
                              );
                            }
                            if (
                              "invoiceNumber" in before ||
                              "invoiceNumber" in after
                            ) {
                              parts.push(
                                `Factura: ${before.invoiceNumber ?? "—"} → ${after.invoiceNumber ?? "—"
                                }`
                              );
                            }
                            if (
                              "paymentType" in before ||
                              "paymentType" in after
                            ) {
                              parts.push(
                                `Tipo: ${before.paymentType ?? "—"} → ${after.paymentType ?? "—"
                                }`
                              );
                            }

                            // Manejar cambio de moneda
                            if ("currency" in before || "currency" in after) {
                              const beforeCur =
                                before.currency || entryCurrency || "CRC";
                              const afterCur =
                                after.currency || entryCurrency || "CRC";
                              if (beforeCur !== afterCur) {
                                parts.push(
                                  `Moneda: ${beforeCur} → ${afterCur}`
                                );
                              }
                            }

                            // Manejar montos (pueden estar en amountEgreso o amountIngreso)
                            if (
                              "amountEgreso" in before ||
                              "amountEgreso" in after ||
                              "amountIngreso" in before ||
                              "amountIngreso" in after
                            ) {
                              const beforeAmt = Number(
                                before.amountEgreso || before.amountIngreso || 0
                              );
                              const afterAmt = Number(
                                after.amountEgreso || after.amountIngreso || 0
                              );
                              const beforeCur =
                                (before.currency as "CRC" | "USD") ||
                                entryCurrency ||
                                "CRC";
                              const afterCur =
                                (after.currency as "CRC" | "USD") ||
                                entryCurrency ||
                                "CRC";
                              parts.push(
                                `Monto: ${formatByCurrency(
                                  beforeCur,
                                  beforeAmt
                                )} → ${formatByCurrency(afterCur, afterAmt)}`
                              );
                            }

                            if ("manager" in before || "manager" in after) {
                              parts.push(
                                `Encargado: ${before.manager ?? "—"} → ${after.manager ?? "—"
                                }`
                              );
                            }
                            if ("notes" in before || "notes" in after) {
                              parts.push(
                                `Notas: "${before.notes ?? ""}" → "${after.notes ?? ""
                                }"`
                              );
                            }

                            return `${at}: ${parts.join("; ") ||
                              "Editado (sin cambios detectados)"
                              } `;
                          });
                          auditTooltip = lines.join("\n");
                        } catch {
                          auditTooltip = "Editado";
                          parsedAudit = null;
                        }
                      }
                      return (
                        <tr
                          key={fe.id}
                          className={`border-t border-[var(--input-border)] hover:bg-[var(--muted)] ${isMostRecent ? "bg-[#273238]" : ""
                            } ${isMovementLocked(fe) ? "opacity-60" : ""}`}
                        >
                          <td className="px-3 py-2 align-top text-[var(--muted-foreground)]">
                            {formattedDate}
                          </td>
                          <td className="px-3 py-2 align-top text-[var(--muted-foreground)]">
                            <div className="flex items-center gap-2">
                              <div className="font-semibold text-[var(--muted-foreground)]">
                                {providerName}
                              </div>
                              {fe.isAudit && (
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => {
                                    if (parsedAudit) {
                                      setAuditModalData(parsedAudit);
                                      setAuditModalOpen(true);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (
                                      (e.key === "Enter" || e.key === " ") &&
                                      parsedAudit
                                    ) {
                                      setAuditModalData(parsedAudit);
                                      setAuditModalOpen(true);
                                    }
                                  }}
                                  title={auditTooltip}
                                  className="inline-flex items-center gap-2 text-[11px] text-yellow-400 bg-yellow-900/10 px-2 py-0.5 rounded cursor-pointer"
                                >
                                  <Pencil className="w-3 h-3 text-yellow-300" />
                                  <span>Editado</span>
                                </div>
                              )}
                            </div>
                            {fe.notes && (
                              <div className="mt-1 text-xs text-[var(--muted-foreground)] break-words">
                                {(() => {
                                  // Renderizar iconos para movimientos de cierre con ajustes
                                  if (fe.notes.includes("[ALERT_ICON]")) {
                                    const parts = fe.notes.split("\n");
                                    const headerText =
                                      parts.find(
                                        (p) => !p.includes("[ALERT_ICON]")
                                      ) || "";
                                    const alertLine =
                                      parts.find((p) =>
                                        p.includes("[ALERT_ICON]")
                                      ) || "";
                                    const noteText = alertLine.replace(
                                      "[ALERT_ICON]",
                                      ""
                                    );
                                    return (
                                      <div className="flex flex-col gap-1">
                                        {headerText && (
                                          <div className="text-[10px] font-semibold text-[var(--foreground)] uppercase tracking-wide">
                                            {headerText}
                                          </div>
                                        )}
                                        <div className="flex items-center gap-1.5">
                                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                                          <span>{noteText}</span>
                                        </div>
                                      </div>
                                    );
                                  }
                                  if (fe.notes.startsWith("[CHECK_ICON]")) {
                                    const noteText = fe.notes.replace(
                                      "[CHECK_ICON]",
                                      ""
                                    );
                                    return (
                                      <div className="flex items-center gap-1.5">
                                        <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                                        <span>{noteText}</span>
                                      </div>
                                    );
                                  }
                                  return fe.notes;
                                })()}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top text-[var(--muted-foreground)]">
                            {formatMovementType(fe.paymentType)}
                          </td>
                          <td className="px-3 py-2 align-top text-[var(--muted-foreground)]">
                            #{fe.invoiceNumber}
                          </td>
                          <td className="px-3 py-2 align-top">
                            {isSuccessfulClosing ? (
                              <div className="text-center text-[var(--muted-foreground)]">
                                —
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {isEntryEgreso ? (
                                    <ArrowUpRight className="w-4 h-4 text-red-500" />
                                  ) : (
                                    <ArrowDownRight className="w-4 h-4 text-green-500" />
                                  )}
                                  <span
                                    className={`font-semibold ${isEntryEgreso
                                      ? "text-red-500"
                                      : "text-green-600"
                                      }`}
                                  >
                                    {`${amountPrefix} ${formatByCurrency(
                                      entryCurrency,
                                      movementAmount
                                    )}`}
                                  </span>
                                </div>
                                <span className="text-xs text-[var(--muted-foreground)]">
                                  Saldo anterior:{" "}
                                  {formatByCurrency(
                                    entryCurrency,
                                    previousBalance
                                  )}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top text-[var(--muted-foreground)]">
                            {fe.manager}
                          </td>
                          <td className="px-3 py-2 align-top">
                            {!isMovementLocked(fe) && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-2 rounded border border-[var(--input-border)] px-3 py-1 text-xs font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
                                  onClick={() => handleEditMovement(fe)}
                                  disabled={editingEntryId === fe.id}
                                  title={
                                    isAutoAdjustment
                                      ? "Los ajustes automáticos no se pueden editar"
                                      : "Editar movimiento"
                                  }
                                >
                                  <Pencil className="w-4 h-4" />
                                  {editingEntryId === fe.id
                                    ? "Editando"
                                    : "Editar"}
                                </button>
                                {isPrincipalAdmin && !isAutoAdjustment && (
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-2 rounded border border-red-500/50 px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10"
                                    onClick={() => handleDeleteMovement(fe)}
                                    title="Eliminar movimiento (solo admin principal)"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Eliminar
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Totals for the current search / filters */}
      {isSingleDayFilter && filteredEntries.length > 0 && (isAdminUser || isSuperAdminUser) && (
        <div className="mt-4">
          <div className="flex justify-center">
            <div className="w-full max-w-2xl">
              <div className="px-4 py-3 rounded min-w-[220px] fg-balance-card">
                {isSuperAdminUser ? (
                  <button
                    type="button"
                    onClick={() => setSuperAdminTotalsOpen((p) => !p)}
                    className="w-full flex items-center justify-between gap-3"
                    aria-expanded={superAdminTotalsOpen}
                  >
                    <div className="text-center font-semibold text-sm text-[var(--muted-foreground)] flex-1">
                      Total del día
                    </div>
                    {superAdminTotalsOpen ? (
                      <ChevronUp className="w-4 h-4 text-[var(--muted-foreground)]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[var(--muted-foreground)]" />
                    )}
                  </button>
                ) : (
                  <div className="mb-2 text-center font-semibold text-sm text-[var(--muted-foreground)]">
                    Total del día
                  </div>
                )}

                {(!isSuperAdminUser || superAdminTotalsOpen) && (
                  <div className={isSuperAdminUser ? "mt-3" : ""}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(["CRC", "USD"] as ("CRC" | "USD")[]).map((currency) => {
                        const ingreso = totalsByCurrency[currency].ingreso;
                        const egreso = totalsByCurrency[currency].egreso;
                        const neto = ingreso - egreso;
                        return (
                          <div
                            key={currency}
                            className="rounded border border-[var(--input-border)] bg-[var(--card-bg)] p-3"
                          >
                            <div className="text-xs uppercase tracking-wide">
                              {currency === "CRC" ? "Colones" : "Dólares"}
                            </div>
                            <div className="mt-2 text-[var(--foreground)]">
                              <div className="flex items-center gap-2">
                                <ArrowDownRight className="w-4 h-4 text-green-500" />
                                <div>
                                  Entradas:{" "}
                                  <span className="font-semibold text-green-500">
                                    {formatByCurrency(currency, ingreso)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <ArrowUpRight className="w-4 h-4 text-red-500" />
                                <div>
                                  Salidas:{" "}
                                  <span className="font-semibold text-red-500">
                                    {formatByCurrency(currency, egreso)}
                                  </span>
                                </div>
                              </div>
                              <div className="pt-2">
                                <div>
                                  Neto:{" "}
                                  <span
                                    className={`font-semibold ${neto > 0
                                      ? "text-green-500"
                                      : neto < 0
                                        ? "text-red-500"
                                        : ""
                                      }`}
                                  >
                                    {formatByCurrency(currency, neto)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-5">
        <div className="flex justify-center">
          <div className="w-full max-w-2xl space-y-4">
            {enabledBalanceCurrencies.length > 0 && (
              <div className="px-4 py-3 rounded min-w-[220px] fg-balance-card">
                <div className="mb-3 text-center text-sm font-medium text-[var(--muted-foreground)]">
                  Saldo Actual
                </div>
                <div className="flex flex-col divide-y divide-[var(--input-border)] sm:flex-row sm:divide-y-0 sm:divide-x">
                  {enabledBalanceCurrencies.map((currency) => {
                    const label = currency === "CRC" ? "Colones" : "Dólares";
                    const value =
                      currency === "CRC"
                        ? currentBalanceCRC
                        : currentBalanceUSD;
                    return (
                      <div
                        key={currency}
                        className="flex-1 px-3 py-2 text-center"
                      >
                        <div className="text-xs uppercase tracking-wide text-[var(--foreground)]">
                          {label}
                        </div>
                        <div className="text-lg font-semibold text-[var(--foreground)]">
                          {formatByCurrency(currency, value)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Registrar cierre moved next to 'Agregar movimiento' per UI changes */}
              </div>
            )}
          </div>
        </div>
      </div>

      {auditModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-800/60 px-4"
          onClick={() => setAuditModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded border border-[var(--input-border)] bg-[#1f262a] p-6 shadow-lg text-white"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-modal-title"
          >
            <h3 id="audit-modal-title" className="text-lg font-semibold">
              Historial de edición
            </h3>
            <div className="mt-4 space-y-3 max-h-[60vh] overflow-auto">
              {auditModalData?.history?.map((h, idx) => (
                <div key={idx} className="p-3 bg-[#0f1516] rounded">
                  <div className="text-xs text-[var(--muted-foreground)]">
                    Cambio {idx + 1} —{" "}
                    {h?.at ? dateTimeFormatter.format(new Date(h.at)) : "—"}
                  </div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        Antes
                      </div>
                      <pre className="mt-2 text-sm bg-[#0b1011] p-3 rounded overflow-auto max-h-48">
                        {JSON.stringify(h?.before ?? {}, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        Después
                      </div>
                      <pre className="mt-2 text-sm bg-[#0b1011] p-3 rounded overflow-auto max-h-48">
                        {JSON.stringify(h?.after ?? {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setAuditModalOpen(false)}
                className="px-4 py-2 border border-[var(--input-border)] rounded"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* daily closings block removed from inline view */}
      <DailyClosingModal
        open={dailyClosingModalOpen}
        onClose={handleCloseDailyClosing}
        onConfirm={handleConfirmDailyClosing}
        initialValues={dailyClosingInitialValues}
        editId={editingDailyClosingId}
        onShowHistory={() => setDailyClosingHistoryOpen(true)}
        employees={employeeOptions}
        loadingEmployees={employeesLoading}
        currentBalanceCRC={currentBalanceCRC}
        currentBalanceUSD={currentBalanceUSD}
        managerReadonly={!editingDailyClosingId}
      />

      <ConfirmModal
        open={confirmOpenCreateMovement}
        title="Confirmar empresa y cuenta"
        message={`Vas a registrar un movimiento en la empresa "${company || ""
          }" y en la cuenta "${accountKey}". Verifica que sea correcto antes de continuar.`}
        confirmText="Continuar"
        cancelText="Cancelar"
        actionType="change"
        onConfirm={confirmOpenCreateMovementNow}
        onCancel={cancelOpenCreateMovement}
      />

      <ConfirmModal
        open={confirmDeleteEntry.open}
        title="Eliminar movimiento"
        message={`¿Está seguro que desea eliminar el movimiento #${confirmDeleteEntry.entry?.invoiceNumber || ""
          }? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        onConfirm={confirmDeleteMovement}
        onCancel={cancelDeleteMovement}
        actionType="delete"
      />

      <DailyClosingHistoryModal
        open={dailyClosingHistoryOpen}
        onClose={() => setDailyClosingHistoryOpen(false)}
        closingsAreLoading={closingsAreLoading}
        dailyClosings={dailyClosings}
        visibleDailyClosings={visibleDailyClosings}
        dailyClosingDateFormatter={dailyClosingDateFormatter}
        dateTimeFormatter={dateTimeFormatter}
        buildBreakdownLines={buildBreakdownLines}
        formatByCurrency={formatByCurrency}
        formatDailyClosingDiff={formatDailyClosingDiff}
        getDailyClosingDiffClass={getDailyClosingDiffClass}
        fondoEntries={fondoEntries}
        isAutoAdjustmentProvider={isAutoAdjustmentProvider}
        expandedClosings={expandedClosings}
        setExpandedClosings={setExpandedClosings}
      />
    </div>
  );
}

export function OtraSection({ id }: { id?: string }) {
  // Estado para el filtro rápido
  return (
    <div id={id} className="mt-10">
      <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
        <Layers className="w-5 h-5" /> Reportes
      </h2>
      <div className="p-4 bg-[var(--muted)] border border-[var(--border)] rounded">
        <p className="text-[var(--muted-foreground)]">
          Acciones adicionales proximamente.
        </p>
      </div>
    </div>
  );
}

// Small wrappers so each tab can mount an independent fondo implementation
export function FondoIngresoSection({ id }: { id?: string }) {
  return <FondoSection id={id} mode="ingreso" />;
}

export function FondoEgresoSection({ id }: { id?: string }) {
  return <FondoSection id={id} mode="egreso" />;
}

export function FondoGeneralSection({ id }: { id?: string }) {
  return <FondoSection id={id} mode="all" />;
}
