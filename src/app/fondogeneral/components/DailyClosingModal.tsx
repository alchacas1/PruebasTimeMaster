import React, { useEffect, useMemo, useRef, useState } from 'react';

import ConfirmModal from '../../../components/ui/ConfirmModal';

const CRC_DENOMINATIONS: readonly number[] = [20000, 10000, 5000, 2000, 1000, 500, 100, 50, 25];
const USD_DENOMINATIONS: readonly number[] = [100, 50, 20, 10, 5, 1];

type CountState = Record<number, string>;

const buildInitialCounts = (denominations: readonly number[]): CountState => {
    return denominations.reduce<CountState>((acc, denom) => {
        acc[denom] = '';
        return acc;
    }, {} as CountState);
};

export type DailyClosingFormValues = {
    closingDate: string;
    manager: string;
    notes: string;
    totalCRC: number;
    totalUSD: number;
    breakdownCRC: Record<number, number>;
    breakdownUSD: Record<number, number>;
};

type DailyClosingModalProps = {
    open: boolean;
    onClose: () => void;
    onConfirm: (values: DailyClosingFormValues) => void;
    // When provided, the modal will prefill values for editing an existing closing.
    initialValues?: DailyClosingFormValues | null;
    // When present, the modal is in edit mode (label and behaviour adjusted).
    editId?: string | null;
    // Request parent to show the closings history
    onShowHistory?: () => void;
    employees: string[];
    loadingEmployees: boolean;
    currentBalanceCRC: number;
    currentBalanceUSD: number;
    // Whether the manager field should be readonly (for new closings with default manager)
    managerReadonly?: boolean;
};

const DailyClosingModal: React.FC<DailyClosingModalProps> = ({
    open,
    onClose,
    onConfirm,
    initialValues,
    editId,
    onShowHistory,
    employees,
    loadingEmployees,
    currentBalanceCRC,
    currentBalanceUSD,
    managerReadonly = false,
}) => {
    const modalRef = useRef<HTMLDivElement | null>(null);
    const managerFieldRef = useRef<HTMLSelectElement | HTMLInputElement | null>(null);

    const [closingDateISO, setClosingDateISO] = useState(() => new Date().toISOString());
    const [manager, setManager] = useState('');
    const [notes, setNotes] = useState('');
    const [crcCounts, setCrcCounts] = useState<CountState>(() => buildInitialCounts(CRC_DENOMINATIONS));
    const [usdCounts, setUsdCounts] = useState<CountState>(() => buildInitialCounts(USD_DENOMINATIONS));

    const [confirmDiffOpen, setConfirmDiffOpen] = useState(false);
    const [pendingSubmitValues, setPendingSubmitValues] = useState<DailyClosingFormValues | null>(null);

    const crcFormatter = useMemo(
        () => new Intl.NumberFormat('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
        [],
    );
    const usdFormatter = useMemo(
        () => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
        [],
    );
    const closingDateFormatter = useMemo(
        () => new Intl.DateTimeFormat('es-CR', { dateStyle: 'long', timeStyle: 'short' }),
        [],
    );

    const formatCurrency = (currency: 'CRC' | 'USD', value: number) =>
        currency === 'USD'
            ? `$ ${usdFormatter.format(Math.trunc(value))}`
            : `₡ ${crcFormatter.format(Math.trunc(value))}`;

    const normalizeCount = (raw: string) => {
        if (!raw) return 0;
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    };

    const totalCRC = useMemo(() => CRC_DENOMINATIONS.reduce((sum, denom) => sum + denom * normalizeCount(crcCounts[denom]), 0), [crcCounts]);
    const totalUSD = useMemo(() => USD_DENOMINATIONS.reduce((sum, denom) => sum + denom * normalizeCount(usdCounts[denom]), 0), [usdCounts]);

    const diffCRC = totalCRC - Math.trunc(currentBalanceCRC);
    const diffUSD = totalUSD - Math.trunc(currentBalanceUSD);
    const hasAnyCash = totalCRC > 0 || totalUSD > 0;
    const submitDisabled = manager.trim().length === 0 || !hasAnyCash;
    const hasDifferences = diffCRC !== 0 || diffUSD !== 0;

    const submitDisabledReason = useMemo(() => {
        if (manager.trim().length === 0) {
            return 'Selecciona un encargado para poder guardar.';
        }
        if (!hasAnyCash) {
            return 'No se puede guardar: el efectivo está en 0. Ingresa el conteo en colones o dólares para realizar el cierre.';
        }
        return '';
    }, [manager, hasAnyCash]);

    const differenceLabel = (currency: 'CRC' | 'USD', diff: number) => {
        if (diff === 0) return 'sin diferencias';
        const sign = diff > 0 ? '+' : '-';
        return `${sign} ${formatCurrency(currency, Math.abs(diff))}`;
    };

    const differencesConfirmMessage = useMemo(() => {
        if (!hasDifferences) return '';

        const lines: string[] = ['Hay diferencias entre el efectivo contado y el saldo registrado.', ''];

        if (diffCRC !== 0) {
            lines.push(
                `Colones: contado ${formatCurrency('CRC', totalCRC)} · registrado ${formatCurrency('CRC', currentBalanceCRC)} · diferencia ${differenceLabel('CRC', diffCRC)}`,
            );
        }
        if (diffUSD !== 0) {
            lines.push(
                `Dólares: contado ${formatCurrency('USD', totalUSD)} · registrado ${formatCurrency('USD', currentBalanceUSD)} · diferencia ${differenceLabel('USD', diffUSD)}`,
            );
        }

        lines.push('', '¿Deseas guardar el cierre de todos modos?');
        return lines.join('\n');
    }, [hasDifferences, totalCRC, totalUSD, currentBalanceCRC, currentBalanceUSD, diffCRC, diffUSD]);

    useEffect(() => {
        if (!open) return;
        // If initialValues provided (edit mode), prefill the form; otherwise reset.
        if (initialValues) {
            setClosingDateISO(initialValues.closingDate || new Date().toISOString());
            setNotes(initialValues.notes || '');
            // populate counts from breakdowns
            const crcInitial = buildInitialCounts(CRC_DENOMINATIONS);
            Object.entries(initialValues.breakdownCRC || {}).forEach(([denom, count]) => {
                const d = Number(denom);
                if (Number.isFinite(d) && CRC_DENOMINATIONS.includes(d)) {
                    crcInitial[d] = String(count ?? 0) || '';
                }
            });
            setCrcCounts(crcInitial);

            const usdInitial = buildInitialCounts(USD_DENOMINATIONS);
            Object.entries(initialValues.breakdownUSD || {}).forEach(([denom, count]) => {
                const d = Number(denom);
                if (Number.isFinite(d) && USD_DENOMINATIONS.includes(d)) {
                    usdInitial[d] = String(count ?? 0) || '';
                }
            });
            setUsdCounts(usdInitial);
        } else {
            setClosingDateISO(new Date().toISOString());
            setNotes('');
            setCrcCounts(buildInitialCounts(CRC_DENOMINATIONS));
            setUsdCounts(buildInitialCounts(USD_DENOMINATIONS));
        }
    }, [open, initialValues]);

    useEffect(() => {
        if (!open) return;
        if (initialValues && initialValues.manager) {
            setManager(initialValues.manager);
            return;
        }
        if (employees.length > 0) {
            setManager(prev => {
                if (prev && employees.includes(prev)) {
                    return prev;
                }
                return employees[0];
            });
        } else {
            setManager('');
        }
    }, [open, employees, initialValues]);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    const handleCountChange = (currency: 'CRC' | 'USD', denom: number, value: string) => {
        const sanitized = value.replace(/[^0-9]/g, '');
        if (currency === 'CRC') {
            setCrcCounts(prev => ({ ...prev, [denom]: sanitized }));
        } else {
            setUsdCounts(prev => ({ ...prev, [denom]: sanitized }));
        }
    };

    const incrementCount = (currency: 'CRC' | 'USD', denom: number) => {
        if (currency === 'CRC') {
            setCrcCounts(prev => {
                const curr = Number.parseInt(prev[denom] || '0', 10) || 0;
                return { ...prev, [denom]: String(curr + 1) };
            });
        } else {
            setUsdCounts(prev => {
                const curr = Number.parseInt(prev[denom] || '0', 10) || 0;
                return { ...prev, [denom]: String(curr + 1) };
            });
        }
    };

    const decrementCount = (currency: 'CRC' | 'USD', denom: number) => {
        if (currency === 'CRC') {
            setCrcCounts(prev => {
                const curr = Number.parseInt(prev[denom] || '0', 10) || 0;
                const next = Math.max(0, curr - 1);
                return { ...prev, [denom]: String(next) };
            });
        } else {
            setUsdCounts(prev => {
                const curr = Number.parseInt(prev[denom] || '0', 10) || 0;
                const next = Math.max(0, curr - 1);
                return { ...prev, [denom]: String(next) };
            });
        }
    };

    const focusAdjacentCashInput = (current: HTMLInputElement, direction: 1 | -1) => {
        const root = modalRef.current;
        if (!root) return;

        const cashInputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[data-cash-count-input="true"]'));
        const currentIndex = cashInputs.indexOf(current);
        if (currentIndex === -1) return;

        const next = cashInputs[currentIndex + direction];
        if (next) {
            next.focus();
            next.select();
            return;
        }

        if (direction === 1) {
            managerFieldRef.current?.focus();
        }
    };

    const handleCountKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, currency: 'CRC' | 'USD', denom: number) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            focusAdjacentCashInput(event.currentTarget, event.shiftKey ? -1 : 1);
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            incrementCount(currency, denom);
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            decrementCount(currency, denom);
        }
    };

    const buildBreakdown = (counts: CountState, denominations: readonly number[]) => {
        return denominations.reduce<Record<number, number>>((acc, denom) => {
            acc[denom] = normalizeCount(counts[denom]);
            return acc;
        }, {});
    };

    const handleSubmit = () => {
        const trimmedManager = manager.trim();
        if (!trimmedManager || !hasAnyCash) return;

        const values: DailyClosingFormValues = {
            closingDate: closingDateISO,
            manager: trimmedManager,
            notes,
            totalCRC,
            totalUSD,
            breakdownCRC: buildBreakdown(crcCounts, CRC_DENOMINATIONS),
            breakdownUSD: buildBreakdown(usdCounts, USD_DENOMINATIONS),
        };

        if (hasDifferences) {
            setPendingSubmitValues(values);
            setConfirmDiffOpen(true);
            return;
        }

        onConfirm(values);
    };

    const handleConfirmDifferences = () => {
        if (!pendingSubmitValues) {
            setConfirmDiffOpen(false);
            return;
        }
        onConfirm(pendingSubmitValues);
        setConfirmDiffOpen(false);
        setPendingSubmitValues(null);
    };

    const handleCancelDifferences = () => {
        setConfirmDiffOpen(false);
        setPendingSubmitValues(null);
    };

    const handleClearCounts = () => {
        setCrcCounts(buildInitialCounts(CRC_DENOMINATIONS));
        setUsdCounts(buildInitialCounts(USD_DENOMINATIONS));
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-full sm:max-w-3xl rounded border border-[var(--input-border)] bg-[#1f262a] text-white shadow-lg max-h-[80vh] overflow-hidden flex flex-col"
                onClick={event => event.stopPropagation()}
                ref={modalRef}
            >
                <div className="flex items-center justify-between gap-4 p-5 pb-0">
                    <div className="flex-1" />
                    <h3 className="text-lg font-semibold text-center">Cierre diario del fondo</h3>
                    <div className="flex-1 flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded border border-[var(--input-border)] px-2 py-1 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                    >
                        Cerrar
                    </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                        <section>
                            <h4 className="text-sm font-semibold text-[var(--foreground)] mb-3">Efectivo (colones)</h4>
                            <div className="space-y-2">
                                {CRC_DENOMINATIONS.map(denom => {
                                    const quantity = normalizeCount(crcCounts[denom]);
                                    const lineTotal = denom * quantity;
                                    return (
                                        <div key={denom} className="flex items-center gap-3">
                                            <label className="w-20 text-xs text-[var(--muted-foreground)]">
                                                {denom.toLocaleString('es-CR')}
                                            </label>
                                            <div className="relative">
                                                <input
                                                    value={crcCounts[denom] ?? ''}
                                                    onChange={event => handleCountChange('CRC', denom, event.target.value)}
                                                    onKeyDown={e => handleCountKeyDown(e, 'CRC', denom)}
                                                    className="w-24 rounded border border-[var(--input-border)] bg-[var(--input-bg)] p-2 pr-8 text-sm text-center"
                                                    inputMode="numeric"
                                                    aria-label={`Cantidad ${denom} colones`}
                                                    data-cash-count-input="true"
                                                />
                                                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col items-center select-none">
                                                    <button
                                                        type="button"
                                                        tabIndex={-1}
                                                        onClick={() => incrementCount('CRC', denom)}
                                                        className="w-5 h-4 leading-[10px] rounded-t bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                                        aria-label={`Aumentar ${denom}`}
                                                    >
                                                        ▲
                                                    </button>
                                                    <button
                                                        type="button"
                                                        tabIndex={-1}
                                                        onClick={() => decrementCount('CRC', denom)}
                                                        className="w-5 h-4 leading-[10px] rounded-b bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                                        aria-label={`Disminuir ${denom}`}
                                                    >
                                                        ▼
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex-1 text-right text-xs text-[var(--muted-foreground)]">
                                                {formatCurrency('CRC', lineTotal)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-3 text-sm font-semibold text-[var(--foreground)]">
                                Total: {formatCurrency('CRC', totalCRC)}
                            </div>
                            <div className={`mt-2 text-sm font-semibold ${diffCRC < 0 ? 'text-red-500' : diffCRC > 0 ? 'text-green-500' : 'white'}`}>
                                Saldo registrado: {formatCurrency('CRC', currentBalanceCRC)} · Diferencia: {differenceLabel('CRC', diffCRC)}
                            </div>
                        </section>

                        <section className="md:border-l md:border-[var(--input-border)] md:pl-6">
                            <h4 className="text-sm font-semibold text-[var(--foreground)] mb-3">Efectivo (dólares)</h4>
                            <div className="space-y-2">
                                {USD_DENOMINATIONS.map(denom => {
                                    const quantity = normalizeCount(usdCounts[denom]);
                                    const lineTotal = denom * quantity;
                                    return (
                                        <div key={denom} className="flex items-center gap-3">
                                            <label className="w-20 text-xs text-[var(--muted-foreground)]">
                                                {denom}
                                            </label>
                                            <div className="relative">
                                                <input
                                                    value={usdCounts[denom] ?? ''}
                                                    onChange={event => handleCountChange('USD', denom, event.target.value)}
                                                    onKeyDown={e => handleCountKeyDown(e, 'USD', denom)}
                                                    className="w-24 rounded border border-[var(--input-border)] bg-[var(--input-bg)] p-2 pr-8 text-sm text-center"
                                                    inputMode="numeric"
                                                    aria-label={`Cantidad ${denom} dólares`}
                                                    data-cash-count-input="true"
                                                />
                                                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col items-center select-none">
                                                    <button
                                                        type="button"
                                                        tabIndex={-1}
                                                        onClick={() => incrementCount('USD', denom)}
                                                        className="w-5 h-4 leading-[10px] rounded-t bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                                        aria-label={`Aumentar ${denom}`}
                                                    >
                                                        ▲
                                                    </button>
                                                    <button
                                                        type="button"
                                                        tabIndex={-1}
                                                        onClick={() => decrementCount('USD', denom)}
                                                        className="w-5 h-4 leading-[10px] rounded-b bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                                        aria-label={`Disminuir ${denom}`}
                                                    >
                                                        ▼
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex-1 text-right text-xs text-[var(--muted-foreground)]">
                                                {formatCurrency('USD', lineTotal)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-3 text-sm font-semibold text-[var(--foreground)]">
                                Total: {formatCurrency('USD', totalUSD)}
                            </div>
                            <div className={`mt-2 text-sm font-semibold ${diffUSD < 0 ? 'text-red-500' : diffUSD > 0 ? 'text-green-500' : 'text-white-500'}`}>
                                Saldo registrado: {formatCurrency('USD', currentBalanceUSD)} · Diferencia: {differenceLabel('USD', diffUSD)}
                            </div>
                        </section>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                                Fecha de cierre
                            </label>
                            <div className="rounded border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--foreground)]">
                                {closingDateFormatter.format(new Date(closingDateISO))}
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                                Encargado
                            </label>
                            {employees.length > 0 ? (
                                <select
                                    value={manager}
                                    onChange={event => setManager(event.target.value)}
                                    className="rounded border border-[var(--input-border)] bg-[var(--input-bg)] p-2 text-sm"
                                    disabled={loadingEmployees || managerReadonly}
                                    ref={el => {
                                        managerFieldRef.current = el;
                                    }}
                                >
                                    <option value="">Seleccionar encargado</option>
                                    {employees.map(name => (
                                        <option key={name} value={name}>
                                            {name}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    value={manager}
                                    onChange={event => setManager(event.target.value)}
                                    className="rounded border border-[var(--input-border)] bg-[var(--input-bg)] p-2 text-sm"
                                    placeholder="Nombre del encargado"
                                    readOnly={managerReadonly}
                                    ref={el => {
                                        managerFieldRef.current = el;
                                    }}
                                />
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                            Observaciones
                        </label>
                        <textarea
                            value={notes}
                            onChange={event => setNotes(event.target.value)}
                            className="min-h-[80px] rounded border border-[var(--input-border)] bg-[var(--input-bg)] p-2 text-sm"
                            maxLength={400}
                            placeholder="Notas adicionales del cierre"
                        />
                    </div>
                </div>

                <div className="px-5 pb-5 pt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--input-border)]">
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleClearCounts}
                            className="rounded border border-[var(--input-border)] px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
                        >
                            Limpiar conteo
                        </button>
                        {onShowHistory && (
                            <button
                                type="button"
                                onClick={() => onShowHistory()}
                                className="rounded border border-[var(--input-border)] px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
                            >
                                Ver historial
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded border border-[var(--input-border)] px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
                        >
                            Cancelar
                        </button>
                        <div className="relative group">
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={submitDisabled}
                                className="rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                            >
                                {editId ? 'Actualizar cierre' : 'Guardar cierre'}
                            </button>
                            {submitDisabled && submitDisabledReason ? (
                                <div
                                    className="pointer-events-none absolute bottom-full right-0 mb-2 w-72 rounded border border-yellow-300 bg-yellow-200 px-3 py-2 text-xs text-black opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:border-yellow-600 dark:bg-yellow-500"
                                    role="tooltip"
                                >
                                    {submitDisabledReason}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>

            <ConfirmModal
                open={confirmDiffOpen}
                title="Confirmar cierre con diferencias"
                message={differencesConfirmMessage}
                confirmText={editId ? 'Actualizar de todos modos' : 'Guardar de todos modos'}
                cancelText="Revisar"
                actionType="change"
                onConfirm={handleConfirmDifferences}
                onCancel={handleCancelDifferences}
            />
        </div>
    );
};

export default DailyClosingModal;
