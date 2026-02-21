'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock, Loader2, Pencil, RefreshCw, Save } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useActorOwnership } from '@/hooks/useActorOwnership';
import { getDefaultPermissions } from '@/utils/permissions';
import { EmpresasService } from '@/services/empresas';
import {
    MovimientosFondosService,
    type MovementAccountKey,
    type MovementCurrencyKey,
    type MovementStorage,
} from '@/services/movimientos-fondos';
import type { FondoEntry } from '../components/fondo';

const ACCOUNT_LABELS: Record<MovementAccountKey, string> = {
    FondoGeneral: 'Fondo General',
    BCR: 'Cuenta BCR',
    BN: 'Cuenta BN',
    BAC: 'Cuenta BAC',
};

const ALL_ACCOUNTS: MovementAccountKey[] = ['FondoGeneral', 'BCR', 'BN', 'BAC'];
const ALL_CURRENCIES: MovementCurrencyKey[] = ['CRC', 'USD'];

const CURRENCY_INFO: Record<MovementCurrencyKey, { label: string; symbol: string }> = {
    CRC: { label: 'Colones', symbol: '₡' },
    USD: { label: 'Dólares', symbol: '$' },
};

type CurrencyState = {
    enabled: boolean;
    initial: string;
    current: string;
    editingCurrent: boolean;
};

type AccountStateMap = Record<MovementAccountKey, Record<MovementCurrencyKey, CurrencyState>>;

type SnapshotCurrencyState = {
    enabled: boolean;
    initial: number;
    current: number;
};

type SnapshotState = Record<MovementAccountKey, Record<MovementCurrencyKey, SnapshotCurrencyState>>;

const createCurrencyState = (): CurrencyState => ({ enabled: true, initial: '0', current: '0', editingCurrent: false });

const createAccountState = (): AccountStateMap => ({
    FondoGeneral: { CRC: createCurrencyState(), USD: createCurrencyState() },
    BCR: { CRC: createCurrencyState(), USD: createCurrencyState() },
    BN: { CRC: createCurrencyState(), USD: createCurrencyState() },
    BAC: { CRC: createCurrencyState(), USD: createCurrencyState() },
});

const createSnapshotCurrencyState = (): SnapshotCurrencyState => ({ enabled: true, initial: 0, current: 0 });

const createSnapshotState = (): SnapshotState => ({
    FondoGeneral: { CRC: createSnapshotCurrencyState(), USD: createSnapshotCurrencyState() },
    BCR: { CRC: createSnapshotCurrencyState(), USD: createSnapshotCurrencyState() },
    BN: { CRC: createSnapshotCurrencyState(), USD: createSnapshotCurrencyState() },
    BAC: { CRC: createSnapshotCurrencyState(), USD: createSnapshotCurrencyState() },
});

const normalizeDigits = (value: string) => value.replace(/[^0-9]/g, '');

// Clave compartida para sincronizar la selección de empresa entre todas las secciones del Fondo General
const SHARED_COMPANY_STORAGE_KEY = 'fg_selected_company_shared';

const parseInitialValue = (value: string): number => {
    const digits = normalizeDigits(value);
    if (digits.length === 0) return 0;
    const parsed = Number(digits);
    if (!Number.isFinite(parsed)) return 0;
    return Math.trunc(parsed);
};

const buildStateFromStorage = (
    storage: MovementStorage<FondoEntry>,
): { settings: AccountStateMap; snapshot: SnapshotState } => {
    const settings = createAccountState();
    const snapshot = createSnapshotState();
    const balances = storage?.state?.balancesByAccount ?? [];

    balances.forEach(balance => {
        const accountId = balance.accountId;
        const currency = balance.currency;
        if (!settings[accountId] || !settings[accountId][currency]) return;
        const enabled = balance.enabled !== false;
        const initial = Math.trunc(Number(balance.initialBalance ?? 0) || 0);
        const current = Math.trunc(Number(balance.currentBalance ?? 0) || 0);
        settings[accountId][currency] = {
            enabled,
            initial: initial.toString(),
            current: current.toString(),
            editingCurrent: false,
        };
        snapshot[accountId][currency] = {
            enabled,
            initial,
            current,
        };
    });

    return { settings, snapshot };
};

export default function FondoGeneralConfigurationPage() {
    const { user, loading } = useAuth();
    const { ownerIds: actorOwnerIds } = useActorOwnership(user);
    const permissions = user?.permissions || getDefaultPermissions(user?.role || 'user');
    const hasFondogeneralAccess = Boolean(permissions.fondogeneral);
    const isPrivileged = user?.role === 'admin' || user?.role === 'superadmin';
    const isSuperAdmin = user?.role === 'superadmin';
    const canAccess = isPrivileged && hasFondogeneralAccess;
    const preferredCompany = user?.ownercompanie?.trim() ?? '';
    const allowedOwnerIds = useMemo(() => {
        const set = new Set<string>();
        actorOwnerIds.forEach(value => {
            if (value === null || value === undefined) return;
            const trimmed = String(value).trim();
            if (trimmed.length > 0) set.add(trimmed);
        });
        if (user?.ownerId !== null && user?.ownerId !== undefined) {
            const trimmed = String(user.ownerId).trim();
            if (trimmed.length > 0) set.add(trimmed);
        }
        return Array.from(set).sort();
    }, [actorOwnerIds, user?.ownerId]);

    const [companies, setCompanies] = useState<string[]>([]);
    const [companiesLoading, setCompaniesLoading] = useState(false);
    const [selectedCompany, setSelectedCompanyState] = useState(() => {
        if (typeof window === 'undefined') return '';
        try {
            return localStorage.getItem(SHARED_COMPANY_STORAGE_KEY) || '';
        } catch {
            return '';
        }
    });
    const [accountSettings, setAccountSettings] = useState<AccountStateMap>(() => createAccountState());
    const [snapshot, setSnapshot] = useState<SnapshotState>(() => createSnapshotState());
    const [storage, setStorage] = useState<MovementStorage<FondoEntry> | null>(null);
    const [loadingStorage, setLoadingStorage] = useState(false);
    const [saving, setSaving] = useState(false);
    const [reloadToken, setReloadToken] = useState(0);

    const [warning, setWarning] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Wrapper para guardar en localStorage y disparar evento de sincronización
    const setSelectedCompany = useCallback((value: string | ((prev: string) => string)) => {
        setSelectedCompanyState(prev => {
            const newValue = typeof value === 'function' ? value(prev) : value;
            if (newValue && newValue !== prev) {
                try {
                    localStorage.setItem(SHARED_COMPANY_STORAGE_KEY, newValue);
                    window.dispatchEvent(new StorageEvent('storage', {
                        key: SHARED_COMPANY_STORAGE_KEY,
                        newValue: newValue,
                        oldValue: prev,
                        storageArea: localStorage
                    }));
                } catch (error) {
                    console.error('Error saving selected company to localStorage:', error);
                }
            }
            return newValue;
        });
    }, []);

    // Escuchar cambios de empresa desde otras secciones (sincronización bidireccional)
    useEffect(() => {
        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === SHARED_COMPANY_STORAGE_KEY && event.newValue) {
                setSelectedCompanyState(prev => {
                    if (event.newValue && event.newValue !== prev && companies.includes(event.newValue)) {
                        return event.newValue;
                    }
                    return prev;
                });
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [companies]);

    const crcFormatter = useMemo(
        () => new Intl.NumberFormat('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
        [],
    );
    const usdFormatter = useMemo(
        () => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
        [],
    );

    const formatByCurrency = useCallback(
        (currency: MovementCurrencyKey, value: number) => {
            const normalized = Math.trunc(Number.isFinite(value) ? value : 0);
            if (currency === 'USD') {
                return `$ ${usdFormatter.format(normalized)}`;
            }
            return `₡ ${crcFormatter.format(normalized)}`;
        },
        [crcFormatter, usdFormatter],
    );

    useEffect(() => {
        if (!success) return;
        const timeout = window.setTimeout(() => setSuccess(null), 4000);
        return () => window.clearTimeout(timeout);
    }, [success]);

    useEffect(() => {
        if (!canAccess) {
            setCompanies([]);
            setSelectedCompany('');
            setStorage(null);
            setAccountSettings(createAccountState());
            setSnapshot(createSnapshotState());
            return;
        }

        let isActive = true;
        setCompaniesLoading(true);
        EmpresasService.getAllEmpresas()
            .then(list => {
                if (!isActive) return;
                const ownerSet = new Set(
                    allowedOwnerIds.map(id => id.trim()).filter(id => id.length > 0),
                );
                const filteredByOwner = isSuperAdmin
                    ? list
                    : ownerSet.size > 0
                        ? list.filter(emp => ownerSet.has((emp.ownerId || '').trim()))
                        : list;

                const getCompanyKey = (emp: any) => String(emp?.name || emp?.ubicacion || emp?.id || '').trim();
                const uniqueCompanyKeys = Array.from(
                    new Set(
                        filteredByOwner
                            .map(emp => getCompanyKey(emp))
                            .filter(key => key.length > 0),
                    ),
                );
                uniqueCompanyKeys.sort((a, b) => a.localeCompare(b, 'es'));
                setCompanies(uniqueCompanyKeys);
            })
            .catch(err => {
                console.error('Error loading empresas for configuration:', err);
                if (isActive) {
                    setError('No se pudieron cargar las empresas disponibles.');
                    setCompanies([]);
                }
            })
            .finally(() => {
                if (isActive) {
                    setCompaniesLoading(false);
                }
            });

        return () => {
            isActive = false;
        };
    }, [allowedOwnerIds, canAccess, isSuperAdmin]);

    useEffect(() => {
        if (!canAccess) {
            setSelectedCompany('');
            return;
        }
        if (companies.length === 0) {
            setSelectedCompany('');
            return;
        }
        setSelectedCompany(prev => {
            // Si ya hay un valor válido en el estado (cargado desde localStorage), mantenerlo
            if (prev && companies.includes(prev)) {
                return prev;
            }
            // Si no hay valor válido, intentar leer desde localStorage compartido
            if (typeof window !== 'undefined') {
                try {
                    const stored = localStorage.getItem(SHARED_COMPANY_STORAGE_KEY);
                    if (stored && companies.includes(stored)) {
                        return stored;
                    }
                } catch {
                    // Ignorar errores de localStorage
                }
            }
            // Si preferredCompany está disponible, usarlo
            if (preferredCompany && companies.includes(preferredCompany)) {
                return preferredCompany;
            }
            // Último recurso: usar la primera empresa
            return companies[0];
        });
    }, [companies, preferredCompany, canAccess]);

    const loadCompanyStorage = useCallback(
        async (companyName: string): Promise<MovementStorage<FondoEntry> | null> => {
            const normalizedCompany = companyName.trim();
            if (normalizedCompany.length === 0) return null;
            const companyKey = MovimientosFondosService.buildCompanyMovementsKey(normalizedCompany);

            let resolved: MovementStorage<FondoEntry> | null = null;
            try {
                resolved = await MovimientosFondosService.getDocument<FondoEntry>(companyKey);
            } catch (remoteError) {
                console.error('Error reading Fondo General configuration from Firestore:', remoteError);
            }

            if (!resolved && typeof window !== 'undefined') {
                const raw = window.localStorage.getItem(companyKey);
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        resolved = MovimientosFondosService.ensureMovementStorageShape<FondoEntry>(parsed, normalizedCompany);
                    } catch (parseError) {
                        console.error('Error parsing Fondo General configuration from localStorage:', parseError);
                    }
                }
            }

            if (!resolved) {
                resolved = MovimientosFondosService.createEmptyMovementStorage<FondoEntry>(normalizedCompany);
            }

            const sanitized = MovimientosFondosService.ensureMovementStorageShape<FondoEntry>(resolved, normalizedCompany);
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(companyKey, JSON.stringify(sanitized));
            }
            return sanitized;
        },
        [],
    );

    useEffect(() => {
        if (!canAccess) return;
        const normalizedCompany = selectedCompany.trim();
        if (normalizedCompany.length === 0) {
            setStorage(null);
            setAccountSettings(createAccountState());
            setSnapshot(createSnapshotState());
            return;
        }

        let isActive = true;
        setLoadingStorage(true);
        setWarning(null);
        setError(null);
        setSuccess(null);

        loadCompanyStorage(normalizedCompany)
            .then(result => {
                if (!isActive || !result) return;
                setStorage(result);
                const { settings, snapshot: snap } = buildStateFromStorage(result);
                setAccountSettings(settings);
                setSnapshot(snap);
            })
            .catch(err => {
                console.error('Error loading Fondo General configuration:', err);
                if (!isActive) return;
                setError('No se pudo cargar la configuración. Inténtalo de nuevo.');
                setStorage(null);
                setAccountSettings(createAccountState());
                setSnapshot(createSnapshotState());
            })
            .finally(() => {
                if (isActive) {
                    setLoadingStorage(false);
                }
            });

        return () => {
            isActive = false;
        };
    }, [selectedCompany, canAccess, loadCompanyStorage, reloadToken]);

    const hasChanges = useMemo(() => {
        if (!storage) return false;
        return ALL_ACCOUNTS.some(accountId =>
            ALL_CURRENCIES.some(currency => {
                const state = accountSettings[accountId][currency];
                const base = snapshot[accountId][currency];
                if (!state || !base) return false;
                const normalizedInitial = parseInitialValue(state.initial);
                const normalizedCurrent = parseInitialValue(state.current);
                return (
                    state.enabled !== base.enabled ||
                    normalizedInitial !== base.initial ||
                    normalizedCurrent !== base.current
                );
            }),
        );
    }, [accountSettings, snapshot, storage]);

    const handleToggleCurrency = useCallback(
        (accountId: MovementAccountKey, currency: MovementCurrencyKey) => {
            setAccountSettings(prev => {
                const account = prev[accountId];
                if (!account) return prev;
                const currentState = account[currency];
                if (!currentState) return prev;
                const nextEnabled = !currentState.enabled;
                if (!nextEnabled) {
                    const fallbackCurrency: MovementCurrencyKey = currency === 'CRC' ? 'USD' : 'CRC';
                    if (!account[fallbackCurrency].enabled) {
                        setWarning(`Debe quedar activa al menos una moneda en ${ACCOUNT_LABELS[accountId]}.`);
                        return prev;
                    }
                }
                setWarning(null);
                return {
                    ...prev,
                    [accountId]: {
                        ...account,
                        [currency]: {
                            ...currentState,
                            enabled: nextEnabled,
                            editingCurrent: nextEnabled ? currentState.editingCurrent : false,
                        },
                    },
                };
            });
        },
        [],
    );

    const handleInitialChange = useCallback(
        (accountId: MovementAccountKey, currency: MovementCurrencyKey, value: string) => {
            const digits = normalizeDigits(value);
            setAccountSettings(prev => ({
                ...prev,
                [accountId]: {
                    ...prev[accountId],
                    [currency]: {
                        ...prev[accountId][currency],
                        initial: digits,
                    },
                },
            }));
        },
        [],
    );

    const handleToggleCurrentEditing = useCallback((accountId: MovementAccountKey, currency: MovementCurrencyKey) => {
        setAccountSettings(prev => {
            const account = prev[accountId];
            if (!account) return prev;
            const state = account[currency];
            if (!state || !state.enabled) return prev;
            const nextEditing = !state.editingCurrent;
            return {
                ...prev,
                [accountId]: {
                    ...account,
                    [currency]: {
                        ...state,
                        editingCurrent: nextEditing,
                    },
                },
            };
        });
    }, []);

    const handleCurrentChange = useCallback(
        (accountId: MovementAccountKey, currency: MovementCurrencyKey, value: string) => {
            const digits = normalizeDigits(value);
            setAccountSettings(prev => ({
                ...prev,
                [accountId]: {
                    ...prev[accountId],
                    [currency]: {
                        ...prev[accountId][currency],
                        current: digits,
                    },
                },
            }));
        },
        [],
    );

    const handleCurrentBlur = useCallback((accountId: MovementAccountKey, currency: MovementCurrencyKey) => {
        setAccountSettings(prev => {
            const account = prev[accountId];
            if (!account) return prev;
            const state = account[currency];
            if (!state) return prev;
            if (state.current.trim().length > 0) return prev;
            return {
                ...prev,
                [accountId]: {
                    ...account,
                    [currency]: {
                        ...state,
                        current: '0',
                    },
                },
            };
        });
    }, []);

    const handleInitialBlur = useCallback((accountId: MovementAccountKey, currency: MovementCurrencyKey) => {
        setAccountSettings(prev => {
            const account = prev[accountId];
            if (!account) return prev;
            const state = account[currency];
            if (!state) return prev;
            if (state.initial.trim().length > 0) return prev;
            return {
                ...prev,
                [accountId]: {
                    ...account,
                    [currency]: {
                        ...state,
                        initial: '0',
                    },
                },
            };
        });
    }, []);

    const handleSave = useCallback(async () => {
        if (!storage || !selectedCompany) return;
        const normalizedCompany = selectedCompany.trim();
        if (normalizedCompany.length === 0) return;

        setSaving(true);
        setError(null);
        setWarning(null);

        try {
            const companyKey = MovimientosFondosService.buildCompanyMovementsKey(normalizedCompany);
            const updatedStorage = MovimientosFondosService.ensureMovementStorageShape<FondoEntry>(storage, normalizedCompany);

            const updatedBalances = updatedStorage.state.balancesByAccount.map(balance => {
                const accountState = accountSettings[balance.accountId];
                const currencyState = accountState?.[balance.currency];
                if (!currencyState) return balance;
                const initialValue = parseInitialValue(currencyState.initial);
                const currentValue = parseInitialValue(currencyState.current);
                return {
                    ...balance,
                    enabled: currencyState.enabled,
                    initialBalance: initialValue,
                    currentBalance: currentValue,
                };
            });

            updatedStorage.state = {
                ...updatedStorage.state,
                balancesByAccount: updatedBalances,
                updatedAt: new Date().toISOString(),
            };

            const updatedAccounts = updatedStorage.configuration.accounts.map(account => {
                const accountState = accountSettings[account.id];
                if (!accountState) return account;
                const supported = ALL_CURRENCIES.filter(currency => accountState[currency].enabled);
                return {
                    ...account,
                    supportedCurrencies: supported,
                };
            });

            const currencyAvailability: Record<MovementCurrencyKey, boolean> = { CRC: false, USD: false };
            ALL_ACCOUNTS.forEach(accountId => {
                const accountState = accountSettings[accountId];
                ALL_CURRENCIES.forEach(currency => {
                    if (accountState?.[currency]?.enabled) {
                        currencyAvailability[currency] = true;
                    }
                });
            });

            const updatedCurrencies = updatedStorage.configuration.currencies.map(currency => ({
                ...currency,
                enabled: currencyAvailability[currency.code],
            }));

            updatedStorage.configuration = {
                ...updatedStorage.configuration,
                accounts: updatedAccounts,
                currencies: updatedCurrencies,
            };

            if (typeof window !== 'undefined') {
                window.localStorage.setItem(companyKey, JSON.stringify(updatedStorage));
            }

            await MovimientosFondosService.saveDocument<FondoEntry>(companyKey, updatedStorage);
            setStorage(updatedStorage);
            const { settings, snapshot: nextSnapshot } = buildStateFromStorage(updatedStorage);
            setAccountSettings(settings);
            setSnapshot(nextSnapshot);
            setSuccess('Los cambios se guardaron correctamente.');
        } catch (err) {
            console.error('Error saving Fondo General configuration:', err);
            setError('No se pudo guardar la configuración. Inténtalo de nuevo.');
        } finally {
            setSaving(false);
        }
    }, [accountSettings, selectedCompany, storage]);

    const handleReload = useCallback(() => {
        if (loadingStorage) return;
        setReloadToken(token => token + 1);
    }, [loadingStorage]);

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <div className="flex items-center justify-center p-8 bg-[var(--card-bg)] rounded-lg border border-[var(--input-border)]">
                    <p className="text-[var(--muted-foreground)]">Cargando permisos...</p>
                </div>
            </div>
        );
    }

    if (!canAccess) {
        return (
            <div className="max-w-4xl mx-auto py-8 px-4">
                <div className="flex flex-col items-center justify-center p-8 bg-[var(--card-bg)] rounded-lg border border-[var(--input-border)] text-center">
                    <Lock className="w-10 h-10 text-[var(--muted-foreground)] mb-4" />
                    <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">Acceso restringido</h3>
                    <p className="text-[var(--muted-foreground)]">Esta sección está disponible únicamente para administradores con acceso al Fondo General.</p>
                    <p className="text-sm text-[var(--muted-foreground)] mt-2">Contacta a un administrador principal si necesitas habilitar esta función.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto py-8 px-4">
            <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-xl p-6">
                <div className="flex flex-col gap-1">
                    <h1 className="text-xl font-semibold text-[var(--foreground)]">Configuración del Fondo General</h1>
                    <p className="text-sm text-[var(--muted-foreground)]">
                        Administra las monedas activas y los saldos iniciales por empresa y cuenta. Los cambios impactan las pestañas operativas del Fondo General.
                    </p>
                </div>

                <div className="mt-6 grid gap-2 sm:grid-cols-[220px,1fr] sm:items-center">
                    <label htmlFor="company-select" className="text-sm font-medium text-[var(--muted-foreground)]">
                        Empresa: 
                    </label>
                    <div className="flex items-center gap-3">
                        <select
                            id="company-select"
                            value={selectedCompany}
                            onChange={event => setSelectedCompany(event.target.value)}
                            className="w-full max-w-xs rounded border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                            disabled={companiesLoading || companies.length === 0 || loadingStorage || saving}
                        >
                            <option value="">Selecciona una empresa</option>
                            {companies.map(company => (
                                <option key={company} value={company}>
                                    {company}
                                </option>
                            ))}
                        </select>
                        {companiesLoading && <Loader2 className="w-4 h-4 animate-spin text-[var(--muted-foreground)]" />}
                    </div>
                </div>

                {warning && (
                    <div className="mt-4 flex items-start gap-2 rounded border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
                        <AlertTriangle className="w-4 h-4 mt-0.5" />
                        <span>{warning}</span>
                    </div>
                )}

                {error && (
                    <div className="mt-4 flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                        <AlertTriangle className="w-4 h-4 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                {success && (
                    <div className="mt-4 flex items-start gap-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                        <CheckCircle2 className="w-4 h-4 mt-0.5" />
                        <span>{success}</span>
                    </div>
                )}

                {loadingStorage ? (
                    <div className="mt-12 flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
                        <span className="ml-3 text-sm text-[var(--muted-foreground)]">Cargando configuración...</span>
                    </div>
                ) : selectedCompany.trim().length === 0 ? (
                    <div className="mt-12 text-sm text-[var(--muted-foreground)]">
                        Selecciona una empresa para revisar su configuración del Fondo General.
                    </div>
                ) : (
                    <div className="mt-8 space-y-6">
                        {ALL_ACCOUNTS.map(accountId => {
                            const accountState = accountSettings[accountId];
                            return (
                                <div
                                    key={accountId}
                                    className="rounded-lg border border-[var(--input-border)] bg-[var(--muted)]/10 p-5"
                                >
                                    <div className="flex flex-col gap-1">
                                        <h2 className="text-lg font-semibold text-[var(--foreground)]">{ACCOUNT_LABELS[accountId]}</h2>
                                        <p className="text-sm text-[var(--muted-foreground)]">
                                            Ajusta las monedas disponibles y el saldo inicial base de esta cuenta.
                                        </p>
                                    </div>
                                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                        {ALL_CURRENCIES.map(currency => {
                                            const currencyState = accountState[currency];
                                            const info = CURRENCY_INFO[currency];
                                            const currentValue = parseInitialValue(currencyState.current);
                                            const formattedBalance = formatByCurrency(currency, currentValue);
                                            const isEditingCurrent = currencyState.editingCurrent;
                                            return (
                                                <div
                                                    key={`${accountId}-${currency}`}
                                                    className="rounded border border-[var(--input-border)] bg-[var(--card-bg)]/90 p-4"
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-semibold text-[var(--foreground)]">
                                                                {info.label} ({info.symbol})
                                                            </div>
                                                            <div className="text-xs text-[var(--muted-foreground)]">
                                                                Saldo actual: {formattedBalance}
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleCurrency(accountId, currency)}
                                                            className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${currencyState.enabled
                                                                ? 'border border-emerald-500 text-emerald-200 bg-emerald-500/10'
                                                                : 'border border-[var(--input-border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]/40'}
                                                            `}
                                                            disabled={saving}
                                                        >
                                                            {currencyState.enabled ? 'Activo' : 'Desactivado'}
                                                        </button>
                                                    </div>
                                                    {currencyState.enabled ? (
                                                        <div className="mt-3">
                                                            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-1">
                                                                Saldo inicial
                                                            </label>
                                                            <input
                                                                value={currencyState.initial}
                                                                onChange={event => handleInitialChange(accountId, currency, event.target.value)}
                                                                onBlur={() => handleInitialBlur(accountId, currency)}
                                                                className="w-full rounded border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                                                                inputMode="numeric"
                                                                pattern="[0-9]*"
                                                                disabled={saving}
                                                            />
                                                            <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                                                                Este valor se usa como punto de partida para el cálculo de saldos en esta moneda.
                                                            </p>
                                                            <div className="mt-4">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                                                                        Saldo actual
                                                                        <span className="ml-2 text-[var(--muted-foreground)] normal-case font-normal">
                                                                            ({formattedBalance})
                                                                        </span>
                                                                    </label>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleToggleCurrentEditing(accountId, currency)}
                                                                        className={`flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors ${isEditingCurrent
                                                                            ? 'border-emerald-500 text-emerald-200 bg-emerald-500/10'
                                                                            : 'border-[var(--input-border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]/40'}`}
                                                                        disabled={!currencyState.enabled || saving}
                                                                    >
                                                                        <Pencil className="w-3 h-3" />
                                                                        {isEditingCurrent ? 'Bloquear' : 'Editar'}
                                                                    </button>
                                                                </div>
                                                                <input
                                                                    value={currencyState.current}
                                                                    onChange={event => handleCurrentChange(accountId, currency, event.target.value)}
                                                                    onBlur={() => handleCurrentBlur(accountId, currency)}
                                                                    className={`mt-2 w-full rounded border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${isEditingCurrent ? '' : 'opacity-70'}`}
                                                                    inputMode="numeric"
                                                                    pattern="[0-9]*"
                                                                    placeholder="0"
                                                                    disabled={!isEditingCurrent || saving}
                                                                />
                                                                <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                                                                    Ajusta el saldo actual manualmente cuando requieras corregir discrepancias específicas.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                                                            Activa esta moneda para editar el saldo inicial asociado.
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="mt-8 flex flex-wrap justify-end gap-3">
                    <button
                        type="button"
                        onClick={handleReload}
                        className="flex items-center gap-2 rounded border border-[var(--input-border)] px-4 py-2 text-sm text-[var(--foreground)] transition hover:bg-[var(--muted)]"
                        disabled={loadingStorage || saving || selectedCompany.trim().length === 0}
                    >
                        <RefreshCw className="w-4 h-4" />
                        Recargar
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-semibold transition ${hasChanges && !saving ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'}`}
                        disabled={!hasChanges || saving || selectedCompany.trim().length === 0}
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                </div>
            </div>
        </div>
    );
}
