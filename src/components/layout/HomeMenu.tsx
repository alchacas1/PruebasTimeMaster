"use client";
import Image from "next/image";
import Fireworks from "fireworks-js";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Scan,
  Calculator,
  Type,
  FileCode,
  Banknote,
  Smartphone,
  Clock,
  Truck,
  Settings,
  History,
  Users,
} from "lucide-react";
import AnimatedStickman from "../ui/AnimatedStickman";
import { CustomIcon } from "../../icons/icons";
import { User, UserPermissions } from "../../types/firestore";
import { getDefaultPermissions } from "../../utils/permissions";
import { useProviders } from "../../hooks/useProviders";
import { useControlPedido } from "../../hooks/useControlPedido";
import { MovimientosFondosService } from "../../services/movimientos-fondos";
import { EmpresasService } from "../../services/empresas";
import type { ControlPedidoEntry } from "../../services/controlpedido";
import {
  addDays,
  dateToKey,
  nextBusinessDay,
  visitDayFromDate,
  weekStartKeyFromDateKey,
} from "../../utils/dateKey";
import { SupplierWeekSection } from "../business/SupplierWeekSection";

const menuItems = [
  {
    id: "scanner",
    name: "Escáner",
    icon: Scan,
    description: "Escanear códigos de barras",
    permission: "scanner" as keyof UserPermissions,
  },
  {
    id: "calculator",
    name: "Calculadora",
    icon: Calculator,
    description: "Calcular precios con descuentos",
    permission: "calculator" as keyof UserPermissions,
  },
  {
    id: "converter",
    name: "Conversor",
    icon: Type,
    description: "Convertir y transformar texto",
    permission: "converter" as keyof UserPermissions,
  },
  {
    id: "xml",
    name: "XML",
    icon: FileCode,
    description: "Cargar archivos XML",
    permission: "xml" as keyof UserPermissions,
  },
  {
    id: "cashcounter",
    name: "Contador Efectivo",
    icon: Banknote,
    description: "Contar billetes y monedas (CRC/USD)",
    permission: "cashcounter" as keyof UserPermissions,
  },
  {
    id: "fondogeneral",
    name: "Fondo General",
    icon: Banknote,
    description: "Administrar el fondo general",
    permission: "fondogeneral" as keyof UserPermissions,
  },
  {
    id: "timingcontrol",
    name: "Control Tiempos",
    icon: Smartphone,
    description: "Registro de venta de tiempos",
    permission: "timingcontrol" as keyof UserPermissions,
  },
  {
    id: "controlhorario",
    name: "Control Horario",
    icon: Clock,
    description: "Registro de horarios de trabajo",
    permission: "controlhorario" as keyof UserPermissions,
  },
  {
    id: "empleados",
    name: "Empleados",
    icon: Users,
    description: "Información de empleados",
    permission: "empleados" as keyof UserPermissions,
  },
  {
    id: "recetas",
    name: "Recetas",
    icon: (props: { className?: string }) => (
      <CustomIcon name="FoodAndSoda" {...props} />
    ),
    description: "Crear y editar recetas",
    permission: "recetas" as keyof UserPermissions,
  },
  {
    id: "calculohorasprecios",
    name: "Cálculo Horas Precios",
    icon: Calculator,
    description: "Cálculo de horas y precios (planilla)",
    permission: "calculohorasprecios" as keyof UserPermissions,
  },
  {
    id: "supplierorders",
    name: "Órdenes Proveedor",
    icon: Truck,
    description: "Gestión de órdenes de proveedores",
    permission: "supplierorders" as keyof UserPermissions,
  },
  {
    id: "scanhistory",
    name: "Historial de Escaneos",
    icon: History,
    description: "Ver historial completo de escaneos",
    permission: "scanhistory" as keyof UserPermissions,
  },
  {
    id: "solicitud",
    name: "Solicitud",
    icon: Type,
    description: "Solicitudes y trámites",
    permission: "solicitud" as keyof UserPermissions,
  },
  {
    id: "edit",
    name: "Mantenimiento",
    icon: Settings,
    description: "Gestión y mantenimiento del sistema",
    permission: "mantenimiento" as keyof UserPermissions,
  },
];

interface HomeMenuProps {
  currentUser?: User | null;
}

function arraysEqual(a: string[], b: string[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function SortableHomeMenuCard({
  id,
  onClick,
  lastDragEndAt,
  className,
  style,
  children,
}: {
  id: string;
  onClick: () => void;
  lastDragEndAt: number;
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const mergedStyle: React.CSSProperties = {
    ...style,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.9 : undefined,
    touchAction: "none",
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => {
        if (isDragging) return;
        if (lastDragEndAt && Date.now() - lastDragEndAt < 250) return;
        onClick();
      }}
      className={className}
      style={mergedStyle}
      {...attributes}
      {...listeners}
    >
      {children}
    </button>
  );
}

export default function HomeMenu({ currentUser }: HomeMenuProps) {
  const [hovered, setHovered] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [showStickman, setShowStickman] = useState(false);
  const [showSupplierWeekInMenu, setShowSupplierWeekInMenu] = useState(false);
  const [enableHomeMenuSortMobile, setEnableHomeMenuSortMobile] = useState(false);
  const [currentHash, setCurrentHash] = useState("");
  const [supplierWeekAnchorKey, setSupplierWeekAnchorKey] = useState<number>(() =>
    dateToKey(new Date())
  );
  const [selectedCreateDateKey, setSelectedCreateDateKey] = useState<number | null>(null);
  const [selectedProviderCode, setSelectedProviderCode] = useState<string>("");
  const [selectedReceiveDateKey, setSelectedReceiveDateKey] = useState<number | null>(null);
  const [orderAmount, setOrderAmount] = useState<string>("");
  const [orderSaving, setOrderSaving] = useState(false);
  const [fondoGeneralBalanceCRC, setFondoGeneralBalanceCRC] = useState<number | null>(null);

  const fireworksRef = useRef<HTMLDivElement>(null);

  // Resolve user permissions once for reuse
  const resolvedPermissions: UserPermissions | null = (() => {
    if (!currentUser) return null;
    return currentUser.permissions
      ? currentUser.permissions
      : getDefaultPermissions(currentUser.role || "user");
  })();

  // Filter menu items based on user permissions
  const getVisibleMenuItems = () => {
    if (!currentUser) {
      // If no user is logged in, show no items for security
      return [];
    }

    // Get user permissions or default permissions based on role
    let userPermissions: UserPermissions;
    if (currentUser.permissions) {
      userPermissions = currentUser.permissions;
    } else {
      // If no permissions are defined, use default permissions based on role
      userPermissions = getDefaultPermissions(currentUser.role || "user");
    }

    // Filter items based on user permissions
    return menuItems.filter((item) => {
      const hasPermission = userPermissions[item.permission];
      return hasPermission === true;
    });
  };

  const visibleMenuItems = getVisibleMenuItems();

  const homeMenuOrderStorageKey = useMemo(() => {
    if (!currentUser) return null;
    const userKey = (currentUser.id || currentUser.email || "anonymous").trim();
    return `pricemaster:home-menu-order:${userKey}`;
  }, [currentUser]);

  const [savedMenuOrder, setSavedMenuOrder] = useState<string[]>([]);

  // Preference: allow HomeMenu reordering on mobile
  useEffect(() => {
    if (typeof window === "undefined") return;

    const readPreference = () => {
      const savedPreference = localStorage.getItem("enable-home-menu-sort-mobile");
      setEnableHomeMenuSortMobile(savedPreference === "true");
    };

    readPreference();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "enable-home-menu-sort-mobile") readPreference();
    };

    const handlePrefChange = (e: Event) => {
      const key = (e as CustomEvent)?.detail?.key;
      if (key === "enable-home-menu-sort-mobile") readPreference();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("pricemaster:preference-change", handlePrefChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("pricemaster:preference-change", handlePrefChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!homeMenuOrderStorageKey) {
      setSavedMenuOrder([]);
      return;
    }

    try {
      const raw = localStorage.getItem(homeMenuOrderStorageKey);
      if (!raw) {
        setSavedMenuOrder([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSavedMenuOrder(parsed.filter((v) => typeof v === "string"));
        return;
      }
      setSavedMenuOrder([]);
    } catch {
      setSavedMenuOrder([]);
    }
  }, [homeMenuOrderStorageKey]);

  const orderedVisibleMenuItemIds = useMemo(() => {
    const currentIds = visibleMenuItems.map((item) => item.id);
    if (currentIds.length === 0) return [];

    const saved = savedMenuOrder.filter((id) => currentIds.includes(id));
    const missing = currentIds.filter((id) => !saved.includes(id));
    return [...saved, ...missing];
  }, [visibleMenuItems, savedMenuOrder]);

  // If new menu items appear, append them and persist for next reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!homeMenuOrderStorageKey) return;
    if (orderedVisibleMenuItemIds.length === 0) return;

    // Only auto-sync when there's already a saved order (avoid writing defaults).
    if (savedMenuOrder.length === 0) return;
    if (arraysEqual(orderedVisibleMenuItemIds, savedMenuOrder)) return;

    setSavedMenuOrder(orderedVisibleMenuItemIds);
    try {
      localStorage.setItem(
        homeMenuOrderStorageKey,
        JSON.stringify(orderedVisibleMenuItemIds)
      );
    } catch {
      // ignore
    }
  }, [homeMenuOrderStorageKey, orderedVisibleMenuItemIds, savedMenuOrder]);

  const orderedVisibleMenuItems = useMemo(() => {
    const byId = new Map(visibleMenuItems.map((item) => [item.id, item] as const));
    return orderedVisibleMenuItemIds
      .map((id) => byId.get(id))
      .filter(Boolean) as typeof visibleMenuItems;
  }, [visibleMenuItems, orderedVisibleMenuItemIds]);

  const reorderEnabled = enableHomeMenuSortMobile;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 50,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 8,
      },
    })
  );

  const [lastDragEndAt, setLastDragEndAt] = useState(0);

  const hasSupplierWeekPermission = Boolean(
    resolvedPermissions?.supplierorders || resolvedPermissions?.fondogeneral
  );
  const isSupplierWeekRoute = currentHash === "#SupplierWeek";
  const showOnlySupplierWeek = isSupplierWeekRoute && hasSupplierWeekPermission;
  const showExpandedSupplierWeek =
    hasSupplierWeekPermission && (isSupplierWeekRoute || showSupplierWeekInMenu);

  const canChangeSupplierWeekCompany =
    currentUser?.role === "admin" || currentUser?.role === "superadmin";

  const assignedCompanyForProviders = (currentUser?.ownercompanie || "").trim();
  const [supplierWeekCompanySelection, setSupplierWeekCompanySelection] = useState<string>(
    () => assignedCompanyForProviders
  );
  const [supplierWeekCompany, setSupplierWeekCompany] = useState<string>(() =>
    assignedCompanyForProviders
  );
  const [supplierWeekCompanyOptions, setSupplierWeekCompanyOptions] = useState<
    Array<{ label: string; value: string }>
  >([]);
  const [supplierWeekCompanyOptionsLoading, setSupplierWeekCompanyOptionsLoading] =
    useState(false);

  // When the supplier week card is shown in the Home menu, it must always reflect the current week.
  useEffect(() => {
    if (showSupplierWeekInMenu && !isSupplierWeekRoute) {
      setSupplierWeekAnchorKey(dateToKey(new Date()));
    }
  }, [showSupplierWeekInMenu, isSupplierWeekRoute]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateHash = () => setCurrentHash(window.location.hash || "");
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const readPreference = () => {
      const savedPreference = localStorage.getItem("show-supplier-week-menu");
      // Por defecto está desactivado (false)
      setShowSupplierWeekInMenu(savedPreference === "true");
    };

    readPreference();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "show-supplier-week-menu") readPreference();
    };

    const handlePrefChange = (e: Event) => {
      const key = (e as CustomEvent)?.detail?.key;
      if (key === "show-supplier-week-menu") readPreference();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("pricemaster:preference-change", handlePrefChange);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        "pricemaster:preference-change",
        handlePrefChange
      );
    };
  }, []);

  useEffect(() => {
    // Mantener la empresa sincronizada con la asignada al usuario.
    // - rol user: forzar siempre a su empresa
    // - otros roles: si no hay selección aún, usar la asignada como default
    if (!currentUser) return;
    if (currentUser.role === "user") {
      setSupplierWeekCompanySelection(assignedCompanyForProviders);
      setSupplierWeekCompany(assignedCompanyForProviders);
      return;
    }
    setSupplierWeekCompanySelection((prev) => (prev ? prev : assignedCompanyForProviders));
    setSupplierWeekCompany((prev) => (prev ? prev : assignedCompanyForProviders));
  }, [currentUser, assignedCompanyForProviders]);

  useEffect(() => {
    // Cargar opciones de empresas para selector (solo admin/superadmin)
    // Nota: solo se necesita en la ruta (no en el card del menú).
    if (!isSupplierWeekRoute) return;
    if (!showExpandedSupplierWeek) return;
    if (!canChangeSupplierWeekCompany) return;
    if (!currentUser) return;

    let cancelled = false;
    const load = async () => {
      setSupplierWeekCompanyOptionsLoading(true);
      try {
        const allEmpresas = await EmpresasService.getAllEmpresas();

        let owned: typeof allEmpresas = [];
        if (currentUser.role === "superadmin") {
          owned = allEmpresas || [];
        } else {
          const resolvedOwnerId =
            currentUser.ownerId || (currentUser.eliminate === false ? currentUser.id : "") || "";

          owned = (allEmpresas || []).filter((e: any) => {
            if (!e) return false;
            const ownerId = e.ownerId || "";

            const ownerIdMatch = ownerId && String(ownerId) === String(resolvedOwnerId);

            const name = e.name || "";
            const ubicacion = e.ubicacion || "";
            const ownerCompanieMatch =
              currentUser.ownercompanie &&
              (String(name) === String(currentUser.ownercompanie) ||
                String(ubicacion) === String(currentUser.ownercompanie));

            return !!ownerIdMatch || !!ownerCompanieMatch;
          });
        }

        const mapped = (owned || [])
          .map((e: any) => {
            const label = e.name || e.ubicacion || e.id || "Empresa";
            const value = e.ubicacion || e.name || e.id || "";
            return { label: String(label), value: String(value) };
          })
          .filter((x) => x.value.trim().length > 0)
          .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));

        if (cancelled) return;
        setSupplierWeekCompanyOptions(mapped);

        // Si aún no hay empresa seleccionada, resolver la asignada al value disponible
        setSupplierWeekCompanySelection((prev) => {
          if (prev && prev.trim()) return prev;
          const assignedStr = String(assignedCompanyForProviders || "").trim();
          if (!assignedStr) return "";
          const assignedLower = assignedStr.toLowerCase();
          const resolved = mapped.find((m) => {
            const mv = String(m.value || "").toLowerCase();
            const ml = String(m.label || "").toLowerCase();
            return (
              mv === assignedLower ||
              ml === assignedLower ||
              ml.includes(assignedLower) ||
              assignedLower.includes(mv)
            );
          });
          return resolved ? String(resolved.value) : assignedStr;
        });

        setSupplierWeekCompany((prev) => {
          if (prev && prev.trim()) return prev;
          const assignedStr = String(assignedCompanyForProviders || "").trim();
          if (!assignedStr) return "";
          const assignedLower = assignedStr.toLowerCase();
          const resolved = mapped.find((m) => {
            const mv = String(m.value || "").toLowerCase();
            const ml = String(m.label || "").toLowerCase();
            return (
              mv === assignedLower ||
              ml === assignedLower ||
              ml.includes(assignedLower) ||
              assignedLower.includes(mv)
            );
          });
          return resolved ? String(resolved.value) : assignedStr;
        });
      } catch (err) {
        console.error("Error loading empresas for SupplierWeek selector:", err);
        if (!cancelled) setSupplierWeekCompanyOptions([]);
      } finally {
        if (!cancelled) setSupplierWeekCompanyOptionsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [showExpandedSupplierWeek, canChangeSupplierWeekCompany, currentUser, assignedCompanyForProviders]);

  const companyForProviders = supplierWeekCompany;
  const {
    providers: weeklyProviders,
    loading: weeklyProvidersLoading,
    error: weeklyProvidersError,
  } = useProviders(showExpandedSupplierWeek ? companyForProviders : undefined);

  useEffect(() => {
    // Fallback: si el admin selecciona una empresa y no hay proveedores bajo el "value",
    // intentar cargar usando el label (nombre) como key alternativo.
    // Nota: solo tiene sentido en la ruta (donde hay selector de empresa).
    if (!isSupplierWeekRoute) return;
    if (!showExpandedSupplierWeek) return;
    if (!canChangeSupplierWeekCompany) return;
    if (weeklyProvidersLoading) return;
    if (weeklyProvidersError) return;

    const selectedValue = (supplierWeekCompanySelection || "").trim();
    const activeKey = (supplierWeekCompany || "").trim();
    if (!selectedValue || !activeKey) return;

    // Solo intentar fallback cuando todavía estamos usando el value seleccionado.
    if (activeKey !== selectedValue) return;

    const hasAnyProviders = (weeklyProviders || []).length > 0;
    if (hasAnyProviders) return;

    const option = supplierWeekCompanyOptions.find((o) => o.value === selectedValue);
    const alt = (option?.label || "").trim();
    if (!alt || alt === activeKey) return;

    setSupplierWeekCompany(alt);
  }, [
    showExpandedSupplierWeek,
    canChangeSupplierWeekCompany,
    weeklyProvidersLoading,
    weeklyProvidersError,
    weeklyProviders,
    supplierWeekCompanySelection,
    supplierWeekCompany,
    supplierWeekCompanyOptions,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!showExpandedSupplierWeek) {
      setFondoGeneralBalanceCRC(null);
      return;
    }

    const normalizedCompany = (companyForProviders || "").trim();
    if (normalizedCompany.length === 0) {
      setFondoGeneralBalanceCRC(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      const companyKey = MovimientosFondosService.buildCompanyMovementsKey(
        normalizedCompany
      );

      let resolved = null as Awaited<
        ReturnType<typeof MovimientosFondosService.getDocument>
      >;

      // In menu mode, prefer local cache and avoid hitting Firestore.
      if (isSupplierWeekRoute) {
        try {
          resolved = await MovimientosFondosService.getDocument(companyKey);
        } catch (err) {
          console.error("Error reading Fondo General balances:", err);
        }
      }

      if (!resolved) {
        try {
          const raw = window.localStorage.getItem(companyKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            resolved = MovimientosFondosService.ensureMovementStorageShape(
              parsed,
              normalizedCompany
            );
          }
        } catch (err) {
          console.error("Error reading Fondo General balances from cache:", err);
        }
      }

      if (cancelled) return;

      if (!resolved) {
        setFondoGeneralBalanceCRC(null);
        return;
      }

      const crcBalance =
        resolved.state.balancesByAccount.find(
          (b) => b.accountId === "FondoGeneral" && b.currency === "CRC"
        )?.currentBalance ?? 0;

      setFondoGeneralBalanceCRC(crcBalance);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [showExpandedSupplierWeek, companyForProviders]);

  type VisitDay = "D" | "L" | "M" | "MI" | "J" | "V" | "S";
  const WEEK_DAY_CODES: VisitDay[] = ["D", "L", "M", "MI", "J", "V", "S"];
  const WEEK_DAY_LABELS: Record<VisitDay, string> = {
    D: "Domingo",
    L: "Lunes",
    M: "Martes",
    MI: "Miércoles",
    J: "Jueves",
    V: "Viernes",
    S: "Sábado",
  };

  const weekModel = (() => {
    const todayKey = dateToKey(new Date());

    const weekStartKey = weekStartKeyFromDateKey(supplierWeekAnchorKey);
    const start = new Date(weekStartKey);

    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
    const intervalWeeksForFrequency = (frequencyRaw: unknown): number => {
      const freq = typeof frequencyRaw === "string" ? frequencyRaw.trim().toUpperCase() : "SEMANAL";
      if (freq === "QUINCENAL") return 2;
      if (freq === "22 DIAS") return 3; // cada ~3 semanas
      if (freq === "MENSUAL") return 4;
      return 1;
    };

    const providerAppliesToWeek = (visit: any, targetWeekStartKey: number): boolean => {
      if (!visit) return false;
      const interval = intervalWeeksForFrequency(visit.frequency);
      if (interval <= 1) return true;
      const startDateKey = visit.startDateKey;
      if (typeof startDateKey !== "number" || !Number.isFinite(startDateKey)) {
        // Backward compatible: if no anchor configured, show every week.
        return true;
      }
      const anchorWeekStart = weekStartKeyFromDateKey(startDateKey);
      const diffWeeks = Math.round((targetWeekStartKey - anchorWeekStart) / MS_PER_WEEK);
      const mod = ((diffWeeks % interval) + interval) % interval;
      return mod === 0;
    };

    const days = Array.from({ length: 7 }, (_, idx) => {
      const date = new Date(start);
      date.setDate(start.getDate() + idx);
      const code = WEEK_DAY_CODES[idx];
      const dateKey = dateToKey(date);
      return {
        idx,
        code,
        label: WEEK_DAY_LABELS[code],
        date,
        dateKey,
        isToday: dateKey === todayKey,
      };
    });

    type ProviderRef = { code: string; name: string };
    const visitProviders = (weeklyProviders || []).filter((p) => {
      const type = (p.type || "").toUpperCase();
      return type === "COMPRA INVENTARIO" && !!p.visit && providerAppliesToWeek((p as any).visit, weekStartKey);
    });

    const createByCode = new Map<VisitDay, ProviderRef[]>();
    const receiveByCode = new Map<VisitDay, ProviderRef[]>();
    WEEK_DAY_CODES.forEach((c) => {
      createByCode.set(c, []);
      receiveByCode.set(c, []);
    });

    // Helper: compute the next date (same day allowed) whose VisitDay is in allowed codes.
    // We intentionally do NOT skip weekends here, because some providers may have D/S as valid receive days.
    const nextMatchingVisitDay = (baseDate: Date, allowed: VisitDay[], includeSameDay: boolean): Date | null => {
      if (!Array.isArray(allowed) || allowed.length === 0) return null;
      let candidate = new Date(baseDate);
      candidate.setHours(0, 0, 0, 0);

      if (includeSameDay) {
        const c = visitDayFromDate(candidate) as VisitDay;
        if (allowed.includes(c)) return candidate;
      }

      // Guard: deliveries are expected within the next two weeks at most.
      for (let i = 0; i < 14; i++) {
        candidate = addDays(candidate, 1);
        const c = visitDayFromDate(candidate) as VisitDay;
        if (allowed.includes(c)) return candidate;
      }

      return null;
    };

    const isDateWithinWeek = (date: Date, weekStart: Date): boolean => {
      const startKey = dateToKey(weekStart);
      const endKey = dateToKey(addDays(weekStart, 6));
      const key = dateToKey(date);
      return key >= startKey && key <= endKey;
    };

    // Avoid duplicates when a provider has multiple day combinations.
    const createSeen = new Map<VisitDay, Set<string>>();
    const receiveSeen = new Map<VisitDay, Set<string>>();
    WEEK_DAY_CODES.forEach((c) => {
      createSeen.set(c, new Set());
      receiveSeen.set(c, new Set());
    });

    // CREATE: providers that place orders in THIS week.
    visitProviders.forEach((p) => {
      const name = p.name;
      const code = p.code;
      const visit = p.visit;
      if (!visit) return;

      (visit.createOrderDays || []).forEach((d) => {
        const key = d as VisitDay;
        const set = createSeen.get(key);
        if (!createByCode.has(key) || !set) return;
        if (set.has(code)) return;
        set.add(code);
        createByCode.get(key)!.push({ code, name });
      });
    });

    // RECEIVE: providers that will deliver in THIS week.
    // Deliveries can come from orders created this week OR from the previous week
    // (e.g. create Friday -> receive Tuesday of next week).
    (weeklyProviders || []).forEach((p) => {
      const type = (p.type || "").toUpperCase();
      if (type !== "COMPRA INVENTARIO") return;
      const visit = (p as any).visit;
      if (!visit) return;

      const createDays: VisitDay[] = Array.isArray(visit.createOrderDays) ? visit.createOrderDays : [];
      const receiveDays: VisitDay[] = Array.isArray(visit.receiveOrderDays) ? visit.receiveOrderDays : [];
      if (createDays.length === 0 || receiveDays.length === 0) return;

      const providerCode = String(p.code || "");
      const providerName = String(p.name || "");
      if (!providerCode || !providerName) return;

      // Check cycles that could land a delivery inside this week.
      // offsetWeeks=0: create happens this week (delivery could still be this week)
      // offsetWeeks=-1: create happened last week (delivery could land this week)
      const offsets = [0, -1];
      for (const offsetWeeks of offsets) {
        const createWeekStartDate = addDays(new Date(weekStartKey), offsetWeeks * 7);
        createWeekStartDate.setHours(0, 0, 0, 0);
        const createWeekStartKey = dateToKey(createWeekStartDate);

        if (!providerAppliesToWeek(visit, createWeekStartKey)) continue;

        for (const createDayCode of createDays) {
          const idx = WEEK_DAY_CODES.indexOf(createDayCode);
          if (idx < 0) continue;

          const createDate = addDays(createWeekStartDate, idx);
          const includeSameDay = receiveDays.includes(visitDayFromDate(createDate) as VisitDay);
          const deliveryDate = nextMatchingVisitDay(createDate, receiveDays, includeSameDay);
          if (!deliveryDate) continue;

          if (!isDateWithinWeek(deliveryDate, start)) continue;

          const receiveCode = visitDayFromDate(deliveryDate) as VisitDay;
          const set = receiveSeen.get(receiveCode);
          if (!receiveByCode.has(receiveCode) || !set) continue;
          if (set.has(providerCode)) continue;
          set.add(providerCode);
          receiveByCode.get(receiveCode)!.push({ code: providerCode, name: providerName });
        }
      }
    });

    const sortProviders = (list: ProviderRef[]) =>
      list
        .map((p) => ({ code: p.code.trim(), name: p.name.trim() }))
        .filter((p) => p.code && p.name)
        .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

    WEEK_DAY_CODES.forEach((c) => {
      createByCode.set(c, sortProviders(createByCode.get(c) || []));
      receiveByCode.set(c, sortProviders(receiveByCode.get(c) || []));
    });

    return {
      weekStartKey,
      days,
      createByCode,
      receiveByCode,
      visitProviders,
    };
  })();

  const supplierWeekRangeLabel = (() => {
    if (!weekModel.days || weekModel.days.length === 0) return "";
    const start = weekModel.days[0].date;
    const end = weekModel.days[weekModel.days.length - 1].date;
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const fmt = (d: Date) => `${days[d.getDay()]}: ${d.getDate()}/${d.getMonth() + 1}`;
    return `${fmt(start)} – ${fmt(end)}`;
  })();

  // ControlPedido: avoid a live Firestore subscription unless we're on the SupplierWeek route.
  const controlPedidoEnabled = showExpandedSupplierWeek && isSupplierWeekRoute;

  const controlPedidoCacheKey = useMemo(() => {
    if (typeof window === "undefined") return null;
    const c = (companyForProviders || "").trim();
    if (!c) return null;
    const wk = weekModel.weekStartKey;
    if (!Number.isFinite(wk)) return null;
    return `pricemaster:controlpedido:${c}__${wk}`;
  }, [companyForProviders, weekModel.weekStartKey]);

  const [cachedControlEntries, setCachedControlEntries] = useState<ControlPedidoEntry[]>([]);

  const {
    entries: controlEntries,
    loading: controlLoading,
    error: controlError,
    addOrder,
    deleteOrdersForProviderReceiveDay,
  } = useControlPedido(
    controlPedidoEnabled ? companyForProviders : undefined,
    controlPedidoEnabled ? weekModel.weekStartKey : undefined,
    controlPedidoEnabled
  );

  // Persist latest control entries to localStorage (for menu mode display) and keep in-memory cache.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!controlPedidoCacheKey) return;
    if (!controlPedidoEnabled) return;

    setCachedControlEntries(controlEntries || []);

    try {
      const safe = (controlEntries || []).map((e) => ({
        id: String(e.id || ""),
        providerCode: String(e.providerCode || "").trim(),
        providerName: String(e.providerName || "").trim(),
        createDateKey: Number(e.createDateKey),
        receiveDateKey: Number(e.receiveDateKey),
        amount: Number(e.amount),
      }));
      window.localStorage.setItem(controlPedidoCacheKey, JSON.stringify(safe));
    } catch {
      // ignore
    }
  }, [controlPedidoCacheKey, controlPedidoEnabled, controlEntries]);

  // In menu mode (not route), read cached entries from localStorage to avoid Firestore reads.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (controlPedidoEnabled) return;
    if (!showExpandedSupplierWeek) {
      setCachedControlEntries([]);
      return;
    }
    if (!controlPedidoCacheKey) {
      setCachedControlEntries([]);
      return;
    }

    try {
      const raw = window.localStorage.getItem(controlPedidoCacheKey);
      if (!raw) {
        setCachedControlEntries([]);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setCachedControlEntries([]);
        return;
      }
      const normalized: ControlPedidoEntry[] = parsed
        .map((e: any) => {
          const providerCode = String(e?.providerCode || "").trim();
          const providerName = String(e?.providerName || "").trim();
          const createDateKey = Number(e?.createDateKey);
          const receiveDateKey = Number(e?.receiveDateKey);
          const amount = Number(e?.amount);
          if (!providerCode || !providerName) return null;
          if (!Number.isFinite(createDateKey) || !Number.isFinite(receiveDateKey) || !Number.isFinite(amount)) return null;
          return {
            id: String(e?.id || `${providerCode}__${receiveDateKey}`),
            providerCode,
            providerName,
            createDateKey,
            receiveDateKey,
            amount,
            createdAt: undefined,
          } as ControlPedidoEntry;
        })
        .filter(Boolean) as ControlPedidoEntry[];

      setCachedControlEntries(normalized);
    } catch {
      setCachedControlEntries([]);
    }
  }, [controlPedidoCacheKey, controlPedidoEnabled, showExpandedSupplierWeek]);

  // weekModel is computed above (needs weeklyProviders)

  useEffect(() => {
    // Reset selection when leaving SupplierWeek route
    if (!isSupplierWeekRoute) {
      setSelectedCreateDateKey(null);
      setSelectedProviderCode("");
      setSelectedReceiveDateKey(null);
      setOrderAmount("");
    }
  }, [isSupplierWeekRoute]);

  useEffect(() => {
    // Reset selection when changing week
    setSelectedCreateDateKey(null);
    setSelectedProviderCode("");
    setSelectedReceiveDateKey(null);
    setOrderAmount("");
  }, [weekModel.weekStartKey]);

  useEffect(() => {
    // Reset selection when changing company
    if (!showExpandedSupplierWeek) return;
    setSelectedCreateDateKey(null);
    setSelectedProviderCode("");
    setSelectedReceiveDateKey(null);
    setOrderAmount("");
  }, [showExpandedSupplierWeek, companyForProviders]);

  const selectedDay = selectedCreateDateKey
    ? weekModel.days.find((d) => d.dateKey === selectedCreateDateKey) || null
    : null;

  const eligibleProviders = (() => {
    if (!selectedDay) return [];
    const dayCode = selectedDay.code as VisitDay;
    return (weekModel.visitProviders || [])
      .filter((p) => (p.visit?.createOrderDays || []).includes(dayCode))
      .sort((a, b) =>
        a.name.localeCompare(b.name, "es", { sensitivity: "base" })
      );
  })();

  const selectedProvider = selectedProviderCode
    ? eligibleProviders.find((p) => p.code === selectedProviderCode) || null
    : null;

  const isImmediateDeliveryProvider = Boolean(
    selectedProvider &&
    selectedDay &&
    (selectedProvider.visit?.receiveOrderDays || []).includes(selectedDay.code as VisitDay)
  );

  const computeDefaultReceiveDateKey = (providerCode: string, createDate: Date): number => {
    const provider = (weekModel.visitProviders || []).find((p) => p.code === providerCode);
    const receiveDays = provider?.visit?.receiveOrderDays || [];

    if (!provider || receiveDays.length === 0) return dateToKey(createDate);

    const createCode = visitDayFromDate(createDate) as VisitDay;
    if (receiveDays.includes(createCode)) return dateToKey(createDate);

    let candidate = nextBusinessDay(createDate);
    if (receiveDays.length > 0) {
      let guard = 0;
      while (guard < 14) {
        const code = visitDayFromDate(candidate) as VisitDay;
        if (receiveDays.includes(code)) break;
        candidate = nextBusinessDay(candidate);
        guard++;
      }
    }

    return dateToKey(candidate);
  };

  useEffect(() => {
    if (!selectedDay || !selectedProviderCode) {
      setSelectedReceiveDateKey(null);
      return;
    }

    if (isImmediateDeliveryProvider) {
      setSelectedReceiveDateKey(selectedDay.dateKey);
      return;
    }

    setSelectedReceiveDateKey(
      computeDefaultReceiveDateKey(selectedProviderCode, selectedDay.date)
    );
  }, [selectedDay?.dateKey, selectedProviderCode, isImmediateDeliveryProvider]);

  const formatAmount = (amount: number) => {
    if (!Number.isFinite(amount)) return String(amount);
    return amount.toLocaleString("es-CR", {
      maximumFractionDigits: 2,
    });
  };

  const effectiveControlEntries = controlPedidoEnabled ? controlEntries : cachedControlEntries;

  const receiveAmountsByDateKey = useMemo(() => {
    const byDateKey = new Map<number, Map<string, number>>();
    for (const entry of effectiveControlEntries || []) {
      const receiveDateKey = entry.receiveDateKey;
      if (!Number.isFinite(receiveDateKey)) continue;

      const providerCode = String(entry.providerCode || "").trim();
      if (!providerCode) continue;

      const amount = Number(entry.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      let byProvider = byDateKey.get(receiveDateKey);
      if (!byProvider) {
        byProvider = new Map<string, number>();
        byDateKey.set(receiveDateKey, byProvider);
      }

      byProvider.set(providerCode, (byProvider.get(providerCode) || 0) + amount);
    }
    return byDateKey;
  }, [effectiveControlEntries]);

  const receiveAmountByProviderCodeForDay = useCallback(
    (dateKey: number) => receiveAmountsByDateKey.get(dateKey) || new Map<string, number>(),
    [receiveAmountsByDateKey]
  );

  const handleSaveControlPedido = async () => {
    if (!isSupplierWeekRoute) return;
    if (!companyForProviders) return;
    if (!selectedDay) return;
    const provider = eligibleProviders.find((p) => p.code === selectedProviderCode);
    if (!provider) return;

    const parsedAmount = Number(orderAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;

    if (!selectedReceiveDateKey || !Number.isFinite(selectedReceiveDateKey)) {
      return;
    }

    setOrderSaving(true);
    try {
      await addOrder({
        providerCode: provider.code,
        providerName: provider.name,
        createDateKey: selectedDay.dateKey,
        receiveDateKey: selectedReceiveDateKey,
        amount: parsedAmount,
      });
      setOrderAmount("");
      setSelectedProviderCode("");
      setSelectedReceiveDateKey(null);
    } finally {
      setOrderSaving(false);
    }
  };

  const handleDeleteControlPedido = async () => {
    if (!isSupplierWeekRoute) return;
    if (!companyForProviders) return;
    if (!selectedProviderCode) return;
    if (!selectedReceiveDateKey || !Number.isFinite(selectedReceiveDateKey)) return;

    setOrderSaving(true);
    try {
      await deleteOrdersForProviderReceiveDay(
        selectedProviderCode,
        selectedReceiveDateKey
      );
      setOrderAmount("");
    } finally {
      setOrderSaving(false);
    }
  };

  const handleNavigate = (id: string) => {
    if (typeof window !== "undefined") {
      // Redirigir a la ruta específica para la herramienta usando hash navigation
      // Nota: al entrar a "Recetas" se debe ir primero a "Agregar Producto".
      const target = id === "recetas" ? "agregarproducto" : id;
      window.location.hash = `#${target}`;
    }
  };

  const handleLogoClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    setHovered((h) => !h);

    if (newCount >= 5) {
      setShowStickman(true);
    }
  };

  // Mostrar fuegos artificiales automáticamente al ingresar al HomeMenu durante 6 segundos
  {
    /*useEffect(() => {
    if (fireworksRef.current && !fireworksInstance) {
      const fw = new Fireworks(fireworksRef.current);
      fw.start();
      setFireworksInstance(fw);

      const timer = setTimeout(() => {
        fw.stop();
        setFireworksInstance(null);
      }, 86400); // 6 segundos

      return () => clearTimeout(timer);
    }
  }, []); // Se ejecuta solo al montar el componente
  */
  }

  // Ocultar el AnimatedStickman después de 10 segundos
  useEffect(() => {
    if (showStickman) {
      const timer = setTimeout(() => {
        setShowStickman(false);
      }, 10000); // 10 segundos

      return () => clearTimeout(timer);
    }
  }, [showStickman]);



  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-8">
      <div
        ref={fireworksRef}
        className="fixed inset-0 pointer-events-none z-40"
      />
      <div className="mb-2 flex items-center justify-center relative">
        <Image
          src="/Logos/LogoBlanco2.png"
          alt="Time Master logo"
          className={`w-28 h-28 mr-2 transition-transform duration-300 ${hovered ? "scale-110 rotate-12" : "scale-100"
            }`}
          width={56}
          height={56}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={handleLogoClick}
          style={{
            cursor: "pointer",
            filter: hovered ? "drop-shadow(0 0 8px var(--foreground))" : "none",
          }}
        />
      </div>
      <h1 className="text-3xl font-bold mb-8 text-center">
        {currentUser
          ? `¡Qué gusto verte, ${currentUser.name ?? currentUser.email ?? "Usuario"
          } !`
          : "¡Qué gusto verte!"}
      </h1>

      {visibleMenuItems.length === 0 ? (
        <div className="text-center py-12">
          <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-xl p-8 max-w-md mx-auto">
            <Settings className="w-16 h-16 mx-auto mb-4 text-[var(--primary)]" />
            <h3 className="text-xl font-semibold mb-2 text-[var(--foreground)]">
              Sin herramientas disponibles
            </h3>
            <p className="text-[var(--muted-foreground)] mb-4">
              No tienes permisos para acceder a ninguna herramienta en este
              momento.
            </p>
            <p className="text-sm text-[var(--muted-foreground)]">
              Contacta a tu administrador para obtener acceso a las
              funcionalidades que necesitas.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full max-w-screen-xl pt-4">
          {hasSupplierWeekPermission && (
            <SupplierWeekSection
              isSupplierWeekRoute={isSupplierWeekRoute}
              showSupplierWeekInMenu={showSupplierWeekInMenu}
              companyForProviders={companyForProviders}
              companySelectorValue={supplierWeekCompanySelection}
              canChangeCompanyForProviders={canChangeSupplierWeekCompany && !supplierWeekCompanyOptionsLoading}
              companyOptionsForProviders={supplierWeekCompanyOptions}
              onCompanyForProvidersChange={(value) => {
                if (!canChangeSupplierWeekCompany) return;
                setSupplierWeekCompanySelection(value);
                setSupplierWeekCompany(value);
              }}
              weeklyProvidersLoading={weeklyProvidersLoading}
              weeklyProvidersError={weeklyProvidersError}
              weekModel={weekModel}
              supplierWeekRangeLabel={supplierWeekRangeLabel}
              fondoGeneralBalanceCRC={fondoGeneralBalanceCRC}
              onNavigateSupplierWeek={() => handleNavigate("SupplierWeek")}
              onPrevWeek={() =>
                setSupplierWeekAnchorKey((prev) =>
                  dateToKey(addDays(new Date(prev), -7))
                )
              }
              onNextWeek={() =>
                setSupplierWeekAnchorKey((prev) =>
                  dateToKey(addDays(new Date(prev), 7))
                )
              }
              selectedDay={selectedDay}
              selectedProviderCode={selectedProviderCode}
              selectedReceiveDateKey={selectedReceiveDateKey}
              eligibleProviders={eligibleProviders.map((p) => ({
                code: p.code,
                name: p.name,
              }))}
              orderAmount={orderAmount}
              orderSaving={orderSaving}
              controlLoading={controlLoading}
              controlError={controlError}
              formatAmount={formatAmount}
              receiveAmountByProviderCodeForDay={receiveAmountByProviderCodeForDay}
              setSelectedCreateDateKey={setSelectedCreateDateKey}
              setSelectedProviderCode={setSelectedProviderCode}
              setSelectedReceiveDateKey={setSelectedReceiveDateKey}
              setOrderAmount={setOrderAmount}
              handleSaveControlPedido={handleSaveControlPedido}
              handleDeleteControlPedido={handleDeleteControlPedido}
            />
          )}

          {!showOnlySupplierWeek && orderedVisibleMenuItems.length > 0 && (
            reorderEnabled ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => {
                  setLastDragEndAt(Date.now());
                  const { active, over } = event;
                  if (!over) return;
                  if (active.id === over.id) return;

                  const oldIndex = orderedVisibleMenuItemIds.indexOf(String(active.id));
                  const newIndex = orderedVisibleMenuItemIds.indexOf(String(over.id));
                  if (oldIndex < 0 || newIndex < 0) return;

                  const nextOrder = arrayMove(orderedVisibleMenuItemIds, oldIndex, newIndex);
                  setSavedMenuOrder(nextOrder);
                  if (!homeMenuOrderStorageKey) return;
                  try {
                    localStorage.setItem(homeMenuOrderStorageKey, JSON.stringify(nextOrder));
                  } catch {
                    // ignore
                  }
                }}
              >
                <SortableContext
                  items={orderedVisibleMenuItemIds}
                  strategy={rectSortingStrategy}
                >
                  {orderedVisibleMenuItems.map((item) => (
                    <SortableHomeMenuCard
                      key={item.id}
                      id={item.id}
                      onClick={() => handleNavigate(item.id)}
                      lastDragEndAt={lastDragEndAt}
                      className="bg-[var(--card-bg)] dark:bg-[var(--card-bg)] border border-[var(--input-border)] rounded-xl shadow-md p-6 flex flex-col items-center transition hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] group touch-manipulation"
                      style={{ minHeight: 160 }}
                    >
                      <item.icon className="w-10 h-10 mb-3 text-[var(--primary)] group-hover:scale-110 group-hover:text-[var(--button-hover)] transition-all" />
                      <span className="text-lg font-semibold mb-1 text-[var(--foreground)] dark:text-[var(--foreground)]">
                        {item.name}
                      </span>
                      <span className="text-sm text-[var(--muted-foreground)] text-center">
                        {item.description}
                      </span>
                      {/* No badge shown here; navigation goes to the Fondo General page */}
                    </SortableHomeMenuCard>
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              <>
                {orderedVisibleMenuItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigate(item.id)}
                    className="bg-[var(--card-bg)] dark:bg-[var(--card-bg)] border border-[var(--input-border)] rounded-xl shadow-md p-6 flex flex-col items-center transition hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] group touch-manipulation"
                    style={{ minHeight: 160 }}
                  >
                    <item.icon className="w-10 h-10 mb-3 text-[var(--primary)] group-hover:scale-110 group-hover:text-[var(--button-hover)] transition-all" />
                    <span className="text-lg font-semibold mb-1 text-[var(--foreground)] dark:text-[var(--foreground)]">
                      {item.name}
                    </span>
                    <span className="text-sm text-[var(--muted-foreground)] text-center">
                      {item.description}
                    </span>
                  </button>
                ))}
              </>
            )
          )}
        </div>
      )}

      {/* AnimatedStickman aparece solo después de 5 clicks */}
      {showStickman && (
        <div className="fixed inset-0 pointer-events-none z-50">
          <AnimatedStickman />
        </div>
      )}
    </div>
  );
}
