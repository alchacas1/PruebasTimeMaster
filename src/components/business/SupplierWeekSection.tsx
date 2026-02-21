import { useMemo, useState } from "react";
import { Truck } from "lucide-react";
import ConfirmModal from "../ui/ConfirmModal";

export type SupplierWeekVisitDay = "D" | "L" | "M" | "MI" | "J" | "V" | "S";

export type SupplierWeekDayModel = {
    code: SupplierWeekVisitDay;
    label: string;
    date: Date;
    dateKey: number;
    isToday: boolean;
};

export type SupplierWeekProviderRef = { code: string; name: string };

export type SupplierWeekModel = {
    weekStartKey: number;
    days: SupplierWeekDayModel[];
    createByCode: Map<SupplierWeekVisitDay, SupplierWeekProviderRef[]>;
    receiveByCode: Map<SupplierWeekVisitDay, SupplierWeekProviderRef[]>;
};

export type SupplierWeekSectionProps = {
    isSupplierWeekRoute: boolean;
    showSupplierWeekInMenu: boolean;
    companyForProviders: string;
    companySelectorValue?: string;
    canChangeCompanyForProviders?: boolean;
    companyOptionsForProviders?: Array<{ label: string; value: string }>;
    onCompanyForProvidersChange?: (company: string) => void;
    weeklyProvidersLoading: boolean;
    weeklyProvidersError: string | null;
    weekModel: SupplierWeekModel;
    supplierWeekRangeLabel: string;
    fondoGeneralBalanceCRC: number | null;
    onNavigateSupplierWeek: () => void;
    onPrevWeek: () => void;
    onNextWeek: () => void;

    // Control de pedido (solo ruta)
    selectedDay: SupplierWeekDayModel | null;
    selectedProviderCode: string;
    selectedReceiveDateKey: number | null;
    eligibleProviders: Array<{ code: string; name: string }>;
    orderAmount: string;
    orderSaving: boolean;
    controlLoading: boolean;
    controlError: string | null;
    formatAmount: (amount: number) => string;
    receiveAmountByProviderCodeForDay: (dateKey: number) => Map<string, number>;
    setSelectedCreateDateKey: (dateKey: number | null) => void;
    setSelectedProviderCode: (providerCode: string) => void;
    setSelectedReceiveDateKey: (receiveDateKey: number | null) => void;
    setOrderAmount: (amount: string) => void;
    handleSaveControlPedido: () => void | Promise<void>;

    // Eliminar monto asignado (por proveedor + día de recepción)
    handleDeleteControlPedido: () => void | Promise<void>;
};

export function SupplierWeekSection(props: SupplierWeekSectionProps) {
    const {
        isSupplierWeekRoute,
        showSupplierWeekInMenu,
        companyForProviders,
        companySelectorValue,
        canChangeCompanyForProviders,
        companyOptionsForProviders,
        onCompanyForProvidersChange,
        weeklyProvidersLoading,
        weeklyProvidersError,
        weekModel,
        supplierWeekRangeLabel,
        fondoGeneralBalanceCRC,
        onNavigateSupplierWeek,
        onPrevWeek,
        onNextWeek,
        selectedDay,
        selectedProviderCode,
        selectedReceiveDateKey,
        eligibleProviders,
        orderAmount,
        orderSaving,
        controlLoading,
        controlError,
        formatAmount,
        receiveAmountByProviderCodeForDay,
        setSelectedCreateDateKey,
        setSelectedProviderCode,
        setSelectedReceiveDateKey,
        setOrderAmount,
        handleSaveControlPedido,
        handleDeleteControlPedido,
    } = props;

    const selectedCompanyForUi = (companySelectorValue ?? companyForProviders).trim();
    const showAddProviderButton = canChangeCompanyForProviders
        ? selectedCompanyForUi.length > 0
        : true;

    const canSave =
        !orderSaving &&
        Boolean(selectedDay) &&
        Boolean(selectedProviderCode) &&
        Boolean(selectedReceiveDateKey) &&
        Boolean(orderAmount) &&
        Number(orderAmount) > 0;

    const existingAssignedAmount =
        selectedReceiveDateKey && selectedProviderCode
            ? receiveAmountByProviderCodeForDay(selectedReceiveDateKey).get(
                selectedProviderCode
            ) || 0
            : 0;

    const canDelete =
        !orderSaving &&
        !controlLoading &&
        Boolean(selectedProviderCode) &&
        Boolean(selectedReceiveDateKey) &&
        existingAssignedAmount > 0;

    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteConfirmLoading, setDeleteConfirmLoading] = useState(false);

    const selectedProviderName = useMemo(() => {
        if (!selectedProviderCode) return "";
        return eligibleProviders.find((p) => p.code === selectedProviderCode)?.name || "";
    }, [eligibleProviders, selectedProviderCode]);

    const handleConfirmDelete = async () => {
        if (!canDelete) return;
        setDeleteConfirmLoading(true);
        try {
            await Promise.resolve(handleDeleteControlPedido());
            setDeleteConfirmOpen(false);
        } finally {
            setDeleteConfirmLoading(false);
        }
    };

    if (!(isSupplierWeekRoute || showSupplierWeekInMenu)) {
        return (
            <button
                type="button"
                onClick={onNavigateSupplierWeek}
                className="bg-[var(--card-bg)] dark:bg-[var(--card-bg)] border border-[var(--input-border)] rounded-xl shadow-md p-6 flex flex-col items-center transition hover:scale-105 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] group"
                style={{ minHeight: 160 }}
                aria-label="Abrir Semana actual (proveedores)"
            >
                <Truck className="w-10 h-10 mb-3 text-[var(--primary)] group-hover:scale-110 group-hover:text-[var(--button-hover)] transition-all" />
                <span className="text-lg font-semibold mb-1 text-[var(--foreground)] dark:text-[var(--foreground)] text-center">
                    Semana Proveedores
                </span>
                <span className="text-sm text-[var(--muted-foreground)] text-center">
                    Ver realizar/recibir pedidos
                </span>
            </button>
        );
    }

    if (!isSupplierWeekRoute) {
        return (
            <button
                type="button"
                onClick={onNavigateSupplierWeek}
                className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-xl shadow-md p-6 col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-4 text-left transition hover:scale-[1.01] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                style={{ minHeight: 160 }}
                aria-label="Abrir Semana actual (proveedores)"
            >
                <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-[var(--foreground)]">
                            Semana actual (proveedores)
                        </h3>
                        <p className="text-xs text-[var(--muted-foreground)]">
                            Crea pedido y recibe pedido (Domingo a Sábado)
                        </p>
                    </div>
                </div>

                {!companyForProviders ? (
                    <div className="text-sm text-[var(--muted-foreground)]">
                        No se pudo determinar la empresa del usuario.
                    </div>
                ) : weeklyProvidersLoading ? (
                    <div className="text-sm text-[var(--muted-foreground)]">
                        Cargando proveedores...
                    </div>
                ) : weeklyProvidersError ? (
                    <div className="text-sm text-red-500">{weeklyProvidersError}</div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                        {weekModel.days.map((d) => {
                            const createList = weekModel.createByCode.get(d.code) || [];
                            const receiveList = weekModel.receiveByCode.get(d.code) || [];
                            const hasAny = createList.length > 0 || receiveList.length > 0;
                            const todayStyle = d.isToday
                                ? {
                                    borderColor: "var(--success)",
                                    backgroundColor:
                                        "color-mix(in srgb, var(--success) 18%, var(--card-bg))",
                                }
                                : undefined;

                            const amountsMap = receiveAmountByProviderCodeForDay(d.dateKey);
                            const createText = createList.map((p) => p.name).join(", ");
                            const receiveText = receiveList.map((p) => ({
                                name: p.name,
                                amount: amountsMap.get(p.code) || 0,
                            }));
                            const receiveTotal = receiveText.reduce(
                                (sum, row) => sum + (row.amount > 0 ? row.amount : 0),
                                0
                            );
                            const receiveTotalClassName =
                                typeof fondoGeneralBalanceCRC === "number"
                                    ? receiveTotal <= fondoGeneralBalanceCRC
                                        ? "text-[var(--success)]"
                                        : "text-[var(--error)]"
                                    : "text-[var(--muted-foreground)]";

                            return (
                                <div
                                    key={`week-${d.code}`}
                                    className="rounded-lg border border-[var(--input-border)] p-2 bg-[var(--muted)]"
                                    style={todayStyle}
                                >
                                    <div className="flex items-baseline justify-between gap-2">
                                        <div className="text-xs font-semibold text-[var(--foreground)]">
                                            {d.code}
                                        </div>
                                        <div className="text-[10px] text-[var(--muted-foreground)]">
                                            {d.date.getDate()}/{d.date.getMonth() + 1}
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-[var(--muted-foreground)] mb-2">
                                        {d.label}
                                    </div>

                                    {!hasAny ? (
                                        <div className="text-[10px] text-[var(--muted-foreground)]">
                                            Sin visitas
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {createList.length > 0 && (
                                                <div>
                                                    <div className="text-[10px] font-semibold text-[var(--foreground)]">
                                                        Realizar
                                                    </div>
                                                    <div className="text-[10px] text-[var(--muted-foreground)] break-words">
                                                        {createText}
                                                    </div>
                                                </div>
                                            )}
                                            {receiveList.length > 0 && (
                                                <div>
                                                    <div className="text-[10px] font-semibold text-[var(--foreground)]">
                                                        Recibir
                                                    </div>
                                                    <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                                                        <div className="space-y-0.5">
                                                            {receiveText.map((row) => (
                                                                <div
                                                                    key={row.name}
                                                                    className="flex items-baseline justify-between gap-2"
                                                                >
                                                                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                                                                    <span className="flex-none tabular-nums">
                                                                        {row.amount > 0 ? formatAmount(row.amount) : ""}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                            <div className="mt-1 pt-1 border-t border-[var(--input-border)] flex items-baseline justify-between gap-2">
                                                                <span className="font-semibold text-[var(--foreground)]">TOTAL</span>
                                                                <span
                                                                    className={`flex-none tabular-nums font-semibold ${receiveTotalClassName}`}
                                                                >
                                                                    {formatAmount(receiveTotal)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </button>
        );
    }

    return (
        <div
            className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-xl shadow-md p-4 sm:p-6 col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-4"
            style={{ minHeight: 160 }}
        >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-[var(--foreground)]">
                        Semana recepcion de proveedores
                    </h3>
                    <p className="text-xs text-[var(--muted-foreground)]">
                        {supplierWeekRangeLabel
                            ? `Semana: ${supplierWeekRangeLabel}`
                            : "Crea pedido y recibe pedido (Domingo a Sábado)"}
                    </p>
                </div>

                <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2 w-full sm:w-auto">
                    {canChangeCompanyForProviders &&
                        Array.isArray(companyOptionsForProviders) &&
                        companyOptionsForProviders.length > 0 ? (
                        <select
                            className="w-full sm:w-auto min-w-0 sm:min-w-[240px] px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            style={{
                                background: "var(--input-bg)",
                                border: "1px solid var(--input-border)",
                                color: "var(--foreground)",
                            }}
                            value={companySelectorValue ?? companyForProviders}
                            onChange={(e) => onCompanyForProvidersChange?.(e.target.value)}
                            aria-label="Seleccionar empresa"
                        >
                            <option value="">Seleccionar empresa</option>
                            {companyOptionsForProviders.map((empresaItem) => (
                                <option key={empresaItem.value} value={empresaItem.value}>
                                    {empresaItem.label}
                                </option>
                            ))}
                        </select>
                    ) : null}

                    {showAddProviderButton ? (
                        <button
                            type="button"
                            onClick={() => {
                                if (typeof window === "undefined") return;
                                // Mantener la empresa seleccionada al ir a "Agregar proveedor".
                                // ProviderSection (Fondo General) lee esta clave para decidir la empresa activa.
                                const sharedCompanyKey = "fg_selected_company_shared";
                                // Importante: usar la empresa efectiva (companyForProviders) y no solo el value del selector.
                                // En HomeMenu puede existir un "fallback" donde companyForProviders cambia al label.
                                const selectedCompany = (companyForProviders || selectedCompanyForUi).trim();

                                if (selectedCompany) {
                                    try {
                                        const oldValue = localStorage.getItem(sharedCompanyKey) ?? "";
                                        localStorage.setItem(sharedCompanyKey, selectedCompany);
                                        // Sincronizar dentro de la misma pestaña (listeners de storage no siempre disparan en la misma ventana).
                                        window.dispatchEvent(
                                            new StorageEvent("storage", {
                                                key: sharedCompanyKey,
                                                newValue: selectedCompany,
                                                oldValue,
                                                storageArea: localStorage,
                                            })
                                        );
                                    } catch {
                                        // Si falla storage (modo privado/restricciones), igual navegamos.
                                    }
                                }

                                // Navegación por hash (sin recargar la página)
                                window.location.hash = "#agregarproveedor";
                            }}
                            className="px-3 py-2 rounded-md text-sm font-semibold bg-[var(--hover-bg)] border border-[var(--input-border)] text-[var(--foreground)] whitespace-nowrap"
                            aria-label="Agregar proveedor"
                        >
                            Agregar
                        </button>
                    ) : null}

                    <button
                        type="button"
                        onClick={onPrevWeek}
                        className="px-3 py-2 rounded-md text-sm font-semibold bg-[var(--hover-bg)] border border-[var(--input-border)] text-[var(--foreground)] whitespace-nowrap"
                        aria-label="Semana anterior"
                    >
                        &lt;
                    </button>
                    <button
                        type="button"
                        onClick={onNextWeek}
                        className="px-3 py-2 rounded-md text-sm font-semibold bg-[var(--hover-bg)] border border-[var(--input-border)] text-[var(--foreground)] whitespace-nowrap"
                        aria-label="Semana siguiente"
                    >
                        &gt;
                    </button>
                </div>
            </div>

            {/* Control de pedido (solo en /#SupplierWeek) */}
            <div className="bg-[var(--hover-bg)] rounded-lg p-3 sm:p-4 mb-4 border">
                <form
                    className="w-full"
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!canSave) return;
                        handleSaveControlPedido();
                    }}
                >

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        <div className="">
                            <div className="text-xs text-[var(--muted-foreground)] mb-1">
                                Día seleccionado
                            </div>
                            <div className="text-sm text-[var(--foreground)]">
                                {selectedDay
                                    ? `${selectedDay.label} (${selectedDay.date.getDate()}/${selectedDay.date.getMonth() + 1})`
                                    : "Selecciona un día abajo"}
                            </div>
                        </div>

                        <div className="">
                            <div className="text-xs text-[var(--muted-foreground)] mb-1 ">
                                Proveedor
                            </div>
                            <select
                                className="w-full bg-[var(--background)] border border-[var(--input-border)] rounded-md px-3 py-2 text-sm text-[var(--foreground)]"
                                value={selectedProviderCode}
                                onChange={(e) => {
                                    setSelectedProviderCode(e.target.value);
                                    setSelectedReceiveDateKey(null);
                                }}
                                disabled={!selectedDay || eligibleProviders.length === 0}
                            >
                                <option value="">
                                    {!selectedDay
                                        ? "Selecciona un día"
                                        : eligibleProviders.length === 0
                                            ? "Sin proveedores para ese día"
                                            : "Selecciona proveedor"}
                                </option>
                                {eligibleProviders.map((p) => (
                                    <option key={`prov-${p.code}`} value={p.code}>
                                        {p.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2 justify-between">
                            <div className="flex flex-col sm:flex-row items-start justify-start gap-2">
                                <div className="w-full sm:flex-1 min-w-0">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        step="0.01"
                                        className="w-full bg-[var(--background)] border border-[var(--input-border)] rounded-md px-3 py-2 text-sm text-[var(--foreground)]"
                                        value={orderAmount}
                                        onChange={(e) => setOrderAmount(e.target.value)}
                                        disabled={!selectedProviderCode || orderSaving}
                                    />

                                    <div className="mt-2 flex flex-wrap items-start justify-start gap-2">
                                        <div className="text-xs text-[var(--muted-foreground)]">Monto</div>

                                        {existingAssignedAmount > 0 && (
                                            <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                                <span className="text-[var(--muted-foreground)]">Asignado:</span>
                                                <span className="tabular-nums text-[var(--foreground)]">
                                                    {formatAmount(existingAssignedAmount)}
                                                </span>
                                                <button
                                                    type="button"
                                                    disabled={!canDelete}
                                                    onClick={() => {
                                                        if (!canDelete) return;
                                                        setDeleteConfirmOpen(true);
                                                    }}
                                                    className="text-[11px] px-2 py-1 rounded-md border border-[var(--input-border)] bg-[var(--background)] text-[var(--foreground)] disabled:opacity-50 disabled:cursor-not-allowed"
                                                    aria-label="Eliminar monto asignado"
                                                >
                                                    Eliminar
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={!canSave}
                                    className="w-full sm:w-auto px-4 py-2 min-w-[120px] whitespace-nowrap rounded-md text-sm font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {orderSaving ? "Guardando..." : "Guardar"}
                                </button>
                            </div>
                        </div>

                    </div>

                    {(controlLoading || controlError) && (
                        <div className="mt-3 text-xs">
                            {controlLoading && (
                                <div className="text-[var(--muted-foreground)]">
                                    Cargando control de pedido...
                                </div>
                            )}
                            {controlError && (
                                <div className="text-red-500">{controlError}</div>
                            )}
                        </div>
                    )}
                </form>
            </div >

            <ConfirmModal
                open={deleteConfirmOpen}
                title="Eliminar monto asignado"
                actionType="delete"
                message={
                    <div>
                        <div>
                            ¿Deseas eliminar el monto asignado{selectedProviderName ? " para " : ""}
                            {selectedProviderName ? (
                                <span className="font-semibold">{selectedProviderName}</span>
                            ) : null}
                            ?
                        </div>
                        <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                            Asignado: {formatAmount(existingAssignedAmount)}
                        </div>
                    </div>
                }
                confirmText="Eliminar"
                cancelText="Cancelar"
                loading={deleteConfirmLoading}
                onCancel={() => {
                    if (deleteConfirmLoading) return;
                    setDeleteConfirmOpen(false);
                }}
                onConfirm={handleConfirmDelete}
            />

            {
                !companyForProviders ? (
                    <div className="text-sm text-[var(--muted-foreground)]">
                        No se pudo determinar la empresa del usuario.
                    </div>
                ) : weeklyProvidersLoading ? (
                    <div className="text-sm text-[var(--muted-foreground)]">
                        Cargando proveedores...
                    </div>
                ) : weeklyProvidersError ? (
                    <div className="text-sm text-red-500">{weeklyProvidersError}</div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
                        {weekModel.days.map((d) => {
                            const createList = weekModel.createByCode.get(d.code) || [];
                            const receiveList = weekModel.receiveByCode.get(d.code) || [];
                            const hasAny = createList.length > 0 || receiveList.length > 0;
                            const isSelected = selectedDay && selectedDay.dateKey === d.dateKey;
                            const todayStyle = d.isToday
                                ? {
                                    borderColor: "var(--success)",
                                    backgroundColor:
                                        "color-mix(in srgb, var(--success) 18%, var(--card-bg))",
                                }
                                : undefined;
                            const selectionStyle = isSelected
                                ? {
                                    borderColor: "var(--primary)",
                                    boxShadow: "0 0 0 1px var(--primary)",
                                }
                                : undefined;

                            const amountsMap = receiveAmountByProviderCodeForDay(d.dateKey);
                            const createText = createList.map((p) => p.name).join(", ");
                            const receiveText = receiveList.map((p) => ({
                                name: p.name,
                                amount: amountsMap.get(p.code) || 0,
                            }));
                            const receiveTotal = receiveText.reduce(
                                (sum, row) => sum + (row.amount > 0 ? row.amount : 0),
                                0
                            );
                            const receiveTotalClassName =
                                typeof fondoGeneralBalanceCRC === "number"
                                    ? receiveTotal <= fondoGeneralBalanceCRC
                                        ? "text-[var(--success)]"
                                        : "text-[var(--error)]"
                                    : "text-[var(--muted-foreground)]";

                            return (
                                <button
                                    type="button"
                                    key={`week-${d.code}`}
                                    onClick={() => {
                                        setSelectedCreateDateKey(d.dateKey);
                                        setSelectedProviderCode("");
                                        setSelectedReceiveDateKey(null);
                                    }}
                                    className="rounded-lg border border-[var(--input-border)] p-2 bg-[var(--muted)] text-left cursor-pointer w-full"
                                    style={{ ...todayStyle, ...selectionStyle }}
                                >
                                    <div className="flex items-baseline justify-between gap-2">
                                        <div className="text-xs font-semibold text-[var(--foreground)]">
                                            {d.code}
                                        </div>
                                        <div className="text-[10px] text-[var(--muted-foreground)]">
                                            {d.date.getDate()}/{d.date.getMonth() + 1}
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-[var(--muted-foreground)] mb-2">
                                        {d.label}
                                    </div>

                                    {!hasAny ? (
                                        <div className="text-[10px] text-[var(--muted-foreground)]">
                                            Sin visitas
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {createList.length > 0 && (
                                                <div>
                                                    <div className="text-[10px] font-semibold text-[var(--foreground)]">
                                                        Realizar
                                                    </div>
                                                    <div className="text-[10px] text-[var(--muted-foreground)] break-words">
                                                        {createText}
                                                    </div>
                                                </div>
                                            )}
                                            {receiveList.length > 0 && (
                                                <div>
                                                    <div className="text-[10px] font-semibold text-[var(--foreground)]">
                                                        Recibir
                                                    </div>
                                                    <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                                                        <div className="space-y-0.5">
                                                            {receiveText.map((row) => (
                                                                <div
                                                                    key={row.name}
                                                                    className="flex items-baseline justify-between gap-2"
                                                                >
                                                                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                                                                    <span className="flex-none tabular-nums">
                                                                        {row.amount > 0 ? formatAmount(row.amount) : ""}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                            <div className="mt-1 pt-1 border-t border-[var(--input-border)] flex items-baseline justify-between gap-2">
                                                                <span className="font-semibold text-[var(--foreground)]">TOTAL</span>
                                                                <span
                                                                    className={`flex-none tabular-nums font-semibold ${receiveTotalClassName}`}
                                                                >
                                                                    {formatAmount(receiveTotal)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )
            }
        </div >
    );
}
