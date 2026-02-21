'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Clock as ClockIcon, Lock, User as UserIcon } from 'lucide-react';
import { EmpresasService } from '../../services/empresas';
import { CalculoHorasService } from '../../services/calculohoras';
import { CcssConfigService } from '../../services/ccss-config';
import CalculoHorasModal from '../ui/CalculoHorasModal';
import { useAuth } from '../../hooks/useAuth';
import useToast from '../../hooks/useToast';
import { getDefaultPermissions } from '../../utils/permissions';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatHHMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

interface MappedEmpresa {
  id?: string;
  ownerId?: string;
  label: string;
  value: string;
  names: string[];
}

type PeriodMode = 'first' | 'second' | 'monthly';
const DEFAULT_PRICE_PER_HOUR = 1441;

function getDefaultQuincena(date: Date): Exclude<PeriodMode, 'monthly'> {
  return date.getDate() <= 15 ? 'first' : 'second';
}

function TooltipLines({ text }: { text: string }) {
  return (
    <div className="text-xs leading-5">
      {String(text)
        .split('\n')
        .filter(Boolean)
        .map((line, idx) => (
          <div key={idx}>{line}</div>
        ))}
    </div>
  );
}

function TapTooltip({
  content,
  children,
  disabled,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'top' | 'bottom' } | null>(null);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetStartYRef = useRef(0);
  const sheetLastYRef = useRef(0);
  const sheetLastTRef = useRef(0);
  const sheetVelocityRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsSmallScreen(mq.matches);
    update();

    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }

    // Safari/older browsers
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  const computePosition = () => {
    const el = triggerRef.current;
    if (!el || typeof window === 'undefined') return null;
    const rect = el.getBoundingClientRect();

    const centerX = rect.left + rect.width / 2;
    const preferredTop = rect.top - 10;
    const placement: 'top' | 'bottom' = preferredTop > 80 ? 'top' : 'bottom';
    const top = placement === 'top' ? rect.top - 10 : rect.bottom + 10;

    const left = Math.min(window.innerWidth - 8, Math.max(8, centerX));
    return { top, left, placement };
  };

  const adjustPositionWithinViewport = () => {
    const el = triggerRef.current;
    const tip = tooltipRef.current;
    if (!el || !tip || typeof window === 'undefined') return;

    const triggerRect = el.getBoundingClientRect();
    const tooltipRect = tip.getBoundingClientRect();

    const padding = 8;
    let placement: 'top' | 'bottom' =
      triggerRect.top - tooltipRect.height - 12 > padding ? 'top' : 'bottom';

    // Try to keep the tooltip within vertical viewport
    if (
      placement === 'bottom' &&
      triggerRect.bottom + 10 + tooltipRect.height > window.innerHeight - padding &&
      triggerRect.top - tooltipRect.height - 12 > padding
    ) {
      placement = 'top';
    }

    const top = placement === 'top' ? triggerRect.top - 10 : triggerRect.bottom + 10;
    const desiredCenterX = triggerRect.left + triggerRect.width / 2;
    const minCenterX = padding + tooltipRect.width / 2;
    const maxCenterX = window.innerWidth - padding - tooltipRect.width / 2;
    const left = Math.min(maxCenterX, Math.max(minCenterX, desiredCenterX));

    setPos({ top, left, placement });
  };

  const openTooltip = () => {
    if (disabled) return;
    const nextPos = computePosition();
    setPos(nextPos);
    setOpen(true);
  };

  const closeTooltip = () => {
    setOpen(false);
    setSheetDragY(0);
    setSheetDragging(false);
  };

  useEffect(() => {
    if (!open) return;
    if (isSmallScreen) {
      setSheetDragY(0);
      setSheetDragging(false);
    }
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (triggerRef.current?.contains(t)) return;
      if (tooltipRef.current?.contains(t)) return;
      closeTooltip();
    };

    const onResizeOrScroll = () => {
      if (isSmallScreen) return;
      adjustPositionWithinViewport();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onResizeOrScroll);
    window.addEventListener('scroll', onResizeOrScroll, true);

    // After the tooltip mounts, clamp it within viewport.
    if (!isSmallScreen) {
      requestAnimationFrame(() => adjustPositionWithinViewport());
    }

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onResizeOrScroll);
      window.removeEventListener('scroll', onResizeOrScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isSmallScreen]);

  const onSheetHandlePointerDown = (e: React.PointerEvent) => {
    if (!isSmallScreen) return;
    if (disabled) return;
    // Only vertical drag; prevent browser scroll on the handle.
    e.preventDefault();

    const y = e.clientY;
    sheetStartYRef.current = y;
    sheetLastYRef.current = y;
    sheetLastTRef.current = performance.now();
    sheetVelocityRef.current = 0;
    setSheetDragging(true);

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onSheetHandlePointerMove = (e: React.PointerEvent) => {
    if (!isSmallScreen) return;
    if (!sheetDragging) return;

    const now = performance.now();
    const y = e.clientY;
    const dy = Math.max(0, y - sheetStartYRef.current);

    const dt = Math.max(1, now - sheetLastTRef.current);
    const vy = (y - sheetLastYRef.current) / dt; // px per ms
    sheetVelocityRef.current = vy;
    sheetLastYRef.current = y;
    sheetLastTRef.current = now;

    setSheetDragY(dy);
  };

  const onSheetHandlePointerUp = (e: React.PointerEvent) => {
    if (!isSmallScreen) return;
    if (!sheetDragging) return;
    e.preventDefault();

    const closeThresholdPx = 90;
    const velocityThreshold = 0.9; // px/ms

    const shouldClose = sheetDragY > closeThresholdPx || sheetVelocityRef.current > velocityThreshold;
    setSheetDragging(false);

    if (shouldClose) {
      closeTooltip();
      return;
    }

    // Snap back
    setSheetDragY(0);

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-block"
        tabIndex={disabled ? -1 : 0}
        role={disabled ? undefined : 'button'}
        aria-haspopup={disabled ? undefined : 'dialog'}
        aria-expanded={disabled ? undefined : open}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => {
            const next = !prev;
            if (next) setPos(computePosition());
            return next;
          });
        }}
        onMouseEnter={() => {
          // desktop hover
          if (disabled) return;
          if (isSmallScreen) return;
          openTooltip();
        }}
        onMouseLeave={() => {
          // desktop hover
          if (disabled) return;
          if (isSmallScreen) return;
          closeTooltip();
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((prev) => {
              const next = !prev;
              if (next) setPos(computePosition());
              return next;
            });
          }
          if (e.key === 'Escape') closeTooltip();
        }}
      >
        {children}
      </span>

      {open && isSmallScreen && typeof document !== 'undefined'
        ? createPortal(
          <div className="fixed inset-0 z-[9999]">
            <button
              type="button"
              aria-label="Cerrar"
              className="absolute inset-0 bg-black/40"
              onClick={closeTooltip}
            />

            <div className="absolute inset-x-0 bottom-0 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
              <div
                ref={tooltipRef}
                role="dialog"
                aria-modal="true"
                className="w-full max-w-md mx-auto rounded-xl border border-[var(--input-border)] bg-[var(--card-bg)] text-[var(--foreground)] shadow-xl"
                style={{
                  transform: `translateY(${sheetDragY}px)`,
                  transition: sheetDragging ? 'none' : 'transform 180ms ease-out',
                  willChange: 'transform',
                }}
              >
                <div
                  className="px-4 pt-3 pb-2"
                  onPointerDown={onSheetHandlePointerDown}
                  onPointerMove={onSheetHandlePointerMove}
                  onPointerUp={onSheetHandlePointerUp}
                  onPointerCancel={onSheetHandlePointerUp}
                  style={{ touchAction: 'none' }}
                >
                  <div className="mx-auto h-1.5 w-12 rounded-full bg-[var(--input-border)]" />
                </div>

                <div className="px-4 pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">{content}</div>
                    <button
                      type="button"
                      onClick={closeTooltip}
                      className="flex-none rounded-md border border-[var(--input-border)] bg-[var(--hover-bg)] px-2 py-1 text-xs"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )
        : null}

      {open && !isSmallScreen && pos && typeof document !== 'undefined'
        ? createPortal(
          <div
            ref={tooltipRef}
            role="dialog"
            className="z-[9999] rounded-md border border-[var(--input-border)] bg-[var(--card-bg)] text-[var(--foreground)] shadow-lg px-3 py-2"
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              transform: pos.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
              maxWidth: 'min(360px, calc(100vw - 16px))',
              pointerEvents: 'auto',
            }}
          >
            {content}
          </div>,
          document.body
        )
        : null}
    </>
  );
}

export default function CalculoHorasPrecios() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [empresas, setEmpresas] = useState<MappedEmpresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState('');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [period, setPeriod] = useState<PeriodMode>(() => getDefaultQuincena(new Date()));
  const [selectedEmployee, setSelectedEmployee] = useState<string>('Todos');
  const [saving, setSaving] = useState(false);
  const [pricePerHour, setPricePerHour] = useState<number>(DEFAULT_PRICE_PER_HOUR);
  const [pricePerHourStatus, setPricePerHourStatus] = useState<'loading' | 'config' | 'default'>('default');

  const [timeData, setTimeData] = useState<{ [employeeName: string]: { [day: string]: { seconds: number; timeHHMMSS: string } } }>({});
  const [modal, setModal] = useState<{ isOpen: boolean; employeeName: string; day: number; currentTimeHHMMSS: string }>(
    {
      isOpen: false,
      employeeName: '',
      day: 0,
      currentTimeHHMMSS: '00:00:00'
    }
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // JavaScript month (0-11)
  const monthName = useMemo(() => currentDate.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' }), [currentDate]);

  const userPermissions = useMemo(() => {
    const fallback = getDefaultPermissions((user?.role as any) || 'user');
    return { ...fallback, ...(user?.permissions || {}) };
  }, [user]);

  const canUse = Boolean(userPermissions.calculohorasprecios);

  const isUserRole = user?.role === 'user';
  const resolvedOwnerId = (user?.ownerId || user?.id || '') as string;
  const assignedEmpresa = (user as any)?.ownercompanie as string | undefined;

  const empresaStorageKey = useMemo(() => {
    const scope = resolvedOwnerId || user?.id || user?.email || 'global';
    return `price-master:calculohorasprecios:selectedEmpresa:${scope}`;
  }, [resolvedOwnerId, user?.id, user?.email]);

  const readStoredEmpresa = () => {
    try {
      return localStorage.getItem(empresaStorageKey) || '';
    } catch {
      return '';
    }
  };

  const writeStoredEmpresa = (value: string) => {
    try {
      localStorage.setItem(empresaStorageKey, value);
    } catch {
      // ignore (storage disabled)
    }
  };

  const daysToShow = useMemo(() => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    if (period === 'monthly') return Array.from({ length: lastDay }, (_, i) => i + 1);
    if (period === 'first') return Array.from({ length: 15 }, (_, i) => i + 1);
    return Array.from({ length: lastDay - 15 }, (_, i) => i + 16);
  }, [year, month, period]);

  const todayInfo = useMemo(() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
    };
  }, []);

  const isCurrentMonthView = todayInfo.year === year && todayInfo.month === month;

  const moneyFormatter = useMemo(
    () => new Intl.NumberFormat('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    []
  );

  // Load empresas for this owner
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const allEmpresas = await EmpresasService.getAllEmpresas();

        let owned = allEmpresas || [];
        if (!user) {
          owned = [];
        } else if (user.role !== 'superadmin') {
          owned = (allEmpresas || []).filter((e) => {
            if (!e) return false;
            const ownerIdMatch = e.ownerId && resolvedOwnerId && String(e.ownerId) === String(resolvedOwnerId);
            const ownerCompanieMatch =
              assignedEmpresa && (String(e.name) === String(assignedEmpresa) || String(e.ubicacion) === String(assignedEmpresa));
            return Boolean(ownerIdMatch || ownerCompanieMatch);
          });
        }

        // If an admin has an explicit allowed-company list, restrict the selector to those companies.
        if (user?.role === 'admin') {
          const allowed = (userPermissions.scanhistoryEmpresas || []).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
          if (allowed.length > 0) {
            owned = (owned || []).filter((e) => {
              const candidates = [e.name, e.ubicacion, e.id]
                .filter(Boolean)
                .map((x) => String(x).trim().toLowerCase());
              return candidates.some((c) => allowed.includes(c));
            });
          }
        }

        const mapped: MappedEmpresa[] = (owned || []).map((e) => ({
          id: e.id,
          ownerId: (e as any)?.ownerId ? String((e as any).ownerId) : undefined,
          label: e.name || e.ubicacion || e.id || 'Empresa',
          value: e.ubicacion || e.name || e.id || '',
          names: (e.empleados || [])
            .filter((emp) => Boolean((emp as any)?.amboshorarios) || Boolean((emp as any)?.calculoprecios))
            .map((emp) => emp.Empleado || '')
            .filter(Boolean)
        }));

        setEmpresas(mapped);

        const storedEmpresa = !isUserRole ? readStoredEmpresa() : '';

        // Pick default company
        if (!empresa) {
          if (isUserRole && assignedEmpresa) {
            const assignedStr = String(assignedEmpresa).toLowerCase();
            const match = mapped.find((m) => {
              const mv = String(m.value || '').toLowerCase();
              const ml = String(m.label || '').toLowerCase();
              return mv === assignedStr || ml === assignedStr || ml.includes(assignedStr) || assignedStr.includes(mv);
            });
            if (match?.value) {
              setEmpresa(String(match.value));
            } else if (mapped[0]?.value) {
              setEmpresa(String(mapped[0].value));
            }
          } else if (storedEmpresa && mapped.some((m) => String(m.value) === String(storedEmpresa))) {
            setEmpresa(String(storedEmpresa));
          } else if (mapped[0]?.value) {
            setEmpresa(String(mapped[0].value));
          }
        }
      } catch (err) {
        console.error('Error loading empresas:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
    // We intentionally do not depend on `empresa` here to avoid refetch loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, resolvedOwnerId, assignedEmpresa, isUserRole]);

  // Persist selected empresa (only for roles that can switch)
  useEffect(() => {
    if (!empresa) return;
    if (isUserRole) return;
    writeStoredEmpresa(String(empresa));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa, isUserRole, empresaStorageKey]);

  const names = useMemo(() => empresas.find((e) => e.value === empresa)?.names || [], [empresas, empresa]);

  // Load valorhora (price per hour) for selected empresa (fallback to DEFAULT_PRICE_PER_HOUR)
  useEffect(() => {
    let cancelled = false;

    const loadValorHora = async () => {
      const currentEmpresa = empresas.find((e) => e.value === empresa);
      const empresaOwnerId = currentEmpresa?.ownerId || resolvedOwnerId;

      if (!empresa || !empresaOwnerId) {
        setPricePerHour(DEFAULT_PRICE_PER_HOUR);
        setPricePerHourStatus('default');
        return;
      }

      setPricePerHourStatus('loading');

      try {
        const candidates = [empresa, currentEmpresa?.value, currentEmpresa?.label, currentEmpresa?.id]
          .map(normalizeKey)
          .filter(Boolean);

        const configs = await CcssConfigService.getAllCcssConfigsByOwner(empresaOwnerId);
        const match = (configs || [])
          .flatMap((cfg) => (cfg as any)?.companie || [])
          .find((c: any) => candidates.includes(normalizeKey(c?.ownerCompanie)));

        const rawValorHora = (match as any)?.valorhora;
        const valorhora =
          typeof rawValorHora === 'number'
            ? rawValorHora
            : typeof rawValorHora === 'string'
              ? Number(rawValorHora)
              : NaN;

        if (cancelled) return;

        if (Number.isFinite(valorhora) && valorhora > 0) {
          setPricePerHour(valorhora);
          setPricePerHourStatus('config');
        } else {
          setPricePerHour(DEFAULT_PRICE_PER_HOUR);
          setPricePerHourStatus('default');
        }
      } catch (err) {
        console.error('Error loading valorhora:', err);
        setPricePerHour(DEFAULT_PRICE_PER_HOUR);
        setPricePerHourStatus('default');
      }
    };

    void loadValorHora();

    return () => {
      cancelled = true;
    };
  }, [empresa, empresas, resolvedOwnerId]);

  // Load calculohoras data for selected empresa/month
  useEffect(() => {
    const loadTime = async () => {
      if (!empresa || names.length === 0) {
        setTimeData({});
        return;
      }

      // Restrict company switching for role user (keep it simple and consistent)
      if (isUserRole && assignedEmpresa) {
        const assignedStr = String(assignedEmpresa).toLowerCase();
        const currentEmpresaLabel = (empresas.find((e) => e.value === empresa)?.label || '').toLowerCase();
        const currentEmpresaValue = String(empresa).toLowerCase();
        const ok =
          currentEmpresaValue === assignedStr || currentEmpresaLabel === assignedStr || currentEmpresaLabel.includes(assignedStr);
        if (!ok) {
          showToast('Acceso restringido a tu empresa asignada', 'error');
          return;
        }
      }

      try {
        const entries = await CalculoHorasService.getEntriesByLocationMonth(empresa, year, month);
        const next: { [employeeName: string]: { [day: string]: { seconds: number; timeHHMMSS: string } } } = {};

        names.forEach((employeeName) => {
          next[employeeName] = {};
        });

        (entries || []).forEach((entry) => {
          const employeeName = String(entry.employeeName || '');
          if (!employeeName || !names.includes(employeeName)) return;
          const dayKey = String(entry.day);
          const seconds = typeof entry.totalSeconds === 'number' ? entry.totalSeconds : 0;
          const timeHHMMSS = String(entry.timeHHMMSS || formatHHMMSS(seconds));
          if (seconds > 0) {
            next[employeeName][dayKey] = { seconds, timeHHMMSS };
          }
        });

        setTimeData(next);
      } catch (err) {
        console.error('Error loading calculohoras data:', err);
        showToast('Error cargando registros', 'error');
      }
    };

    loadTime();
  }, [empresa, names, year, month, isUserRole, assignedEmpresa, empresas, showToast]);

  const changeMonth = (direction: 'prev' | 'next') => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + (direction === 'prev' ? -1 : 1));
      return next;
    });
  };

  const openHoursModal = (employeeName: string, day: number) => {
    const currentTimeHHMMSS = timeData[employeeName]?.[String(day)]?.timeHHMMSS || '00:00:00';
    setModal({ isOpen: true, employeeName, day, currentTimeHHMMSS });
  };

  const handleSaveTime = async (payload: { timeHHMMSS: string; totalSeconds: number }) => {
    if (!empresa || !modal.employeeName) return;

    try {
      setSaving(true);
      await CalculoHorasService.upsertTime(empresa, modal.employeeName, year, month, modal.day, payload.timeHHMMSS, payload.totalSeconds);

      setTimeData((prev) => {
        const next = { ...prev };
        const employeeName = modal.employeeName;
        const dayKey = String(modal.day);
        if (!next[employeeName]) next[employeeName] = {};

        if (payload.totalSeconds <= 0) {
          delete next[employeeName][dayKey];
        } else {
          next[employeeName][dayKey] = { seconds: payload.totalSeconds, timeHHMMSS: payload.timeHHMMSS };
        }
        return next;
      });

      showToast(payload.totalSeconds <= 0 ? 'Registro eliminado' : 'Tiempo guardado correctamente', 'success');
    } catch (err) {
      console.error('Error saving calculohoras:', err);
      showToast('Error al guardar el tiempo', 'error');
    } finally {
      setSaving(false);
      setModal({ isOpen: false, employeeName: '', day: 0, currentTimeHHMMSS: '00:00:00' });
    }
  };

  if (!user || !canUse) {
    return (
      <div className="flex items-center justify-center p-8 bg-[var(--card-bg)] rounded-lg border border-[var(--input-border)]">
        <div className="text-center">
          <Lock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">Acceso Restringido</h3>
          <p className="text-[var(--muted-foreground)]">No tienes permisos para acceder a Cálculo horas precios.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-7xl mx-auto bg-[var(--card-bg)] rounded-lg shadow p-4 sm:p-6 border border-[var(--input-border)]">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <ClockIcon className="w-6 h-6 text-[var(--primary)]" />
              <div>
                <h2 className="text-xl font-bold text-[var(--foreground)]">Cálculo horas</h2>
                <p className="text-sm text-[var(--muted-foreground)]">{monthName}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => changeMonth('prev')}
                className="p-2 rounded-md border border-[var(--input-border)] hover:bg-[var(--hover-bg)] transition-colors"
                title="Mes anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => changeMonth('next')}
                className="p-2 rounded-md border border-[var(--input-border)] hover:bg-[var(--hover-bg)] transition-colors"
                title="Mes siguiente"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0 sm:min-w-[220px]">
              <label className="block text-xs text-[var(--muted-foreground)] mb-1">Empresa</label>
              <select
                className="w-full px-3 py-2 text-sm rounded focus:outline-none"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)' }}
                value={empresa}
                onChange={(e) => {
                  if (isUserRole) {
                    showToast('No tienes permisos para cambiar de empresa', 'error');
                    return;
                  }
                  setEmpresa(e.target.value);
                }}
                disabled={loading || isUserRole}
              >
                <option value="" disabled>
                  {loading ? 'Cargando...' : 'Selecciona una empresa'}
                </option>
                {empresas.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0 sm:min-w-[160px]">
              <label className="block text-xs text-[var(--muted-foreground)] mb-1">Vista</label>
              <select
                className="w-full px-3 py-2 text-sm rounded focus:outline-none"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)' }}
                value={period}
                onChange={(e) => setPeriod(e.target.value as PeriodMode)}
              >
                <option value="first">1-15</option>
                <option value="second">16-fin</option>
                <option value="monthly">Mes completo</option>
              </select>
            </div>

            <div className="min-w-0 sm:min-w-[200px]">
              <label className="block text-xs text-[var(--muted-foreground)] mb-1">Empleado</label>
              <div className="flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-[var(--foreground)]" />
                <select
                  className="flex-1 px-3 py-2 text-sm rounded focus:outline-none"
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--foreground)' }}
                  value={selectedEmployee}
                  onChange={(e) => setSelectedEmployee(e.target.value)}
                >
                  <option value="Todos">Todos</option>
                  {names.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto -mx-4 sm:mx-0" style={{ overflowY: 'hidden' }}>
          <div className="min-w-full inline-block">
            <table className="w-full border-collapse border border-[var(--input-border)]">
              <thead>
                <tr>
                  <th
                    className="border border-[var(--input-border)] p-2 font-semibold text-center bg-[var(--input-bg)] text-[var(--foreground)] min-w-[90px] sticky left-0 z-20 text-xs"
                    style={{ background: 'var(--input-bg)', color: 'var(--foreground)', minWidth: '90px', left: 0, height: '40px' }}
                  >
                    Nombre
                  </th>
                  {daysToShow.map((day) => {
                    const isToday = isCurrentMonthView && day === todayInfo.day;

                    const dayDate = new Date(year, month, day);
                    const dayName = dayDate.toLocaleDateString('es-CR', { weekday: 'long' });
                    const monthNameFull = dayDate.toLocaleDateString('es-CR', { month: 'long' });
                    const tooltip = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${day} de ${monthNameFull} de ${year}`;

                    return (
                      <th
                        key={day}
                        className="border border-[var(--input-border)] p-2 font-semibold text-center text-xs"
                        style={{
                          background: isToday ? '#bbf7d0' : 'var(--input-bg)',
                          color: isToday ? '#065f46' : 'var(--foreground)',
                          minWidth: '32px',
                          height: '40px'
                        }}
                      >
                        <span className="relative group" style={{ cursor: 'pointer' }}>
                          {day}
                          <span
                            className="absolute left-1/2 -translate-x-1/2 mt-2 px-2 py-1 rounded bg-gray-900 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-lg"
                            style={{ bottom: '-2.2rem' }}
                          >
                            {tooltip}
                          </span>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {(selectedEmployee === 'Todos' ? names : [selectedEmployee]).map((name) => (
                  <tr key={name}>
                    <td
                      className="border border-[var(--input-border)] p-2 font-medium bg-[var(--input-bg)] text-[var(--foreground)] min-w-[90px] sticky left-0 z-10 text-xs"
                      style={{ background: 'var(--input-bg)', color: 'var(--foreground)', minWidth: '90px', left: 0, height: '40px' }}
                    >
                      {(() => {
                        const totalSeconds = daysToShow.reduce((acc, day) => acc + (timeData[name]?.[String(day)]?.seconds || 0), 0);
                        const totalHours = totalSeconds / 3600;
                        const hasPrice = pricePerHourStatus !== 'loading' && Number.isFinite(pricePerHour) && pricePerHour > 0;
                        const total = hasPrice ? totalHours * pricePerHour : NaN;
                        const priceLine =
                          pricePerHourStatus === 'loading'
                            ? 'Precio hora: cargando...'
                            : `Precio hora: ${moneyFormatter.format(pricePerHour)}${pricePerHourStatus === 'default' ? ' (default)' : ''}`;
                        const totalLine =
                          hasPrice ? `Total: ${moneyFormatter.format(total)}` : 'Total: --';
                        const tooltip =
                          `Tiempo total (hh:mm:ss): ${formatHHMMSS(totalSeconds)}\n` +
                          `${priceLine}\n` +
                          `${totalLine}`;

                        return (
                          <TapTooltip content={<TooltipLines text={tooltip} />}>
                            <span className="block truncate cursor-pointer" title={tooltip}>
                              {name}
                            </span>
                          </TapTooltip>
                        );
                      })()}
                    </td>
                    {daysToShow.map((day) => {
                      const seconds = timeData[name]?.[String(day)]?.seconds || 0;
                      const timeHHMMSS = timeData[name]?.[String(day)]?.timeHHMMSS || '';
                      const isToday = isCurrentMonthView && day === todayInfo.day;
                      return (
                        <td key={day} className="border border-[var(--input-border)] p-0" style={{ minWidth: '32px' }}>
                          <button
                            onClick={() => openHoursModal(name, day)}
                            className="w-full h-full p-1 text-center font-semibold cursor-pointer text-xs border-none outline-none"
                            style={{
                              minWidth: '32px',
                              height: '40px',
                              backgroundColor: seconds > 0 ? '#d1fae5' : 'var(--input-bg)',
                              color: seconds > 0 ? '#065f46' : 'var(--foreground)',
                              boxShadow: isToday ? 'inset 0 0 0 2px #22c55e' : undefined,
                            }}
                            disabled={saving}
                            title={seconds > 0 ? `${timeHHMMSS} - Clic para editar` : 'Clic para agregar tiempo'}
                          >
                            {seconds > 0 ? timeHHMMSS : '▼'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <CalculoHorasModal
        isOpen={modal.isOpen}
        onClose={() => setModal({ isOpen: false, employeeName: '', day: 0, currentTimeHHMMSS: '00:00:00' })}
        onSave={handleSaveTime}
        employeeName={modal.employeeName}
        day={modal.day}
        month={month}
        year={year}
        empresaValue={empresa}
        currentTimeHHMMSS={modal.currentTimeHHMMSS}
      />
    </>
  );
}
