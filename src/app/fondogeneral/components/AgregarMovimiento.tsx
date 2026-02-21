import React, { useState, useEffect } from "react";
import {
  Save,
  Search,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import type { FondoMovementType } from "./fondo";
import {
  formatMovementType,
  isEgresoType,
  isGastoType,
  isIngresoType,
} from "./fondo";

type ProviderOption = {
  code: string;
  name: string;
  type?: FondoMovementType;
};

type AgregarMovimientoProps = {
  selectedProvider: string;
  onProviderChange: (value: string) => void;
  providers: ProviderOption[];
  providersLoading: boolean;
  isProviderSelectDisabled: boolean;
  providerDisabledTooltip?: string;
  selectedProviderExists: boolean;
  invoiceNumber: string;
  onInvoiceNumberChange: (value: string) => void;
  invoiceValid: boolean;
  invoiceDisabled: boolean;
  paymentType: FondoMovementType;
  isEgreso: boolean;
  egreso: string;
  onEgresoChange: (value: string) => void;
  egresoBorderClass: string;
  ingreso: string;
  onIngresoChange: (value: string) => void;
  ingresoBorderClass: string;
  notes: string;
  onNotesChange: (value: string) => void;
  manager: string;
  onManagerChange: (value: string) => void;
  managerSelectDisabled: boolean;
  employeeOptions: string[];
  employeesLoading: boolean;
  editingEntryId: string | null;
  onCancelEditing: () => void;
  onSubmit: () => void;
  isSubmitDisabled: boolean;
  isSaving?: boolean;
  onFieldKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>
  ) => void;
  currency?: "CRC" | "USD";
  onCurrencyChange?: (c: "CRC" | "USD") => void;
  currencyEnabled?: Record<"CRC" | "USD", boolean>;
  providerError?: string;
  invoiceError?: string;
  amountError?: string;
  managerError?: string;
};

const AgregarMovimiento: React.FC<AgregarMovimientoProps> = ({
  selectedProvider,
  onProviderChange,
  providers,
  providersLoading,
  isProviderSelectDisabled,
  providerDisabledTooltip,
  invoiceNumber,
  onInvoiceNumberChange,
  invoiceValid,
  invoiceDisabled,
  isEgreso,
  egreso,
  onEgresoChange,
  egresoBorderClass,
  ingreso,
  onIngresoChange,
  ingresoBorderClass,
  notes,
  onNotesChange,
  manager,
  onManagerChange,
  managerSelectDisabled,
  employeeOptions,
  employeesLoading,
  editingEntryId,
  onCancelEditing,
  onSubmit,
  isSubmitDisabled,
  isSaving = false,
  onFieldKeyDown,
  currency = "CRC",
  onCurrencyChange,
  currencyEnabled = { CRC: true, USD: true },
  providerError = "",
  invoiceError = "",
  amountError = "",
  managerError = "",
}) => {
  const invoiceBorderClass =
    invoiceValid || invoiceNumber.length === 0
      ? "border-[var(--input-border)]"
      : "border-red-500";
  const inputFormatterCRC = React.useMemo(
    () =>
      new Intl.NumberFormat("es-CR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    []
  );
  const inputFormatterUSD = React.useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    []
  );

  const formatInputDisplay = (raw: string) => {
    if (!raw || raw.trim().length === 0) return "";
    const n = Number(raw);
    if (Number.isNaN(n)) return raw;
    return currency === "USD"
      ? `$ ${inputFormatterUSD.format(Math.trunc(n))}`
      : `₡ ${inputFormatterCRC.format(Math.trunc(n))}`;
  };

  const extractDigits = (value: string) => value.replace(/[^0-9]/g, "");

  const [filter, setFilter] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (selectedProvider) {
      const option = providers.find((p) => p.code === selectedProvider);
      setFilter(option ? `${option.name} (${option.code})` : selectedProvider);
    } else {
      setFilter("");
    }
  }, [selectedProvider, providers]);

  const filteredProviders = providers.filter(
    (p) =>
      p.name.toLowerCase().includes(filter.toLowerCase()) ||
      p.code.toLowerCase().includes(filter.toLowerCase())
  );

  const getProviderCategory = (type?: FondoMovementType) => {
    if (!type) return null;
    if (isIngresoType(type)) return "INGRESO" as const;
    if (isEgresoType(type)) return "EGRESO" as const;
    if (isGastoType(type)) return "GASTO" as const;
    return null;
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 grid-cols-1">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Proveedor
          </label>
          <div className="relative group">
            <input
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              onBlur={() => {
                setTimeout(() => setIsDropdownOpen(false), 200);
              }}
              onKeyDown={onFieldKeyDown}
              className={`w-full p-2 border rounded pr-10 ${
                providerError
                  ? "border-red-500"
                  : "border-[var(--input-border)]"
              } ${
                isProviderSelectDisabled && providerDisabledTooltip
                  ? "bg-gray-600 text-gray-400 cursor-not-allowed opacity-70"
                  : "bg-[var(--input-bg)]"
              }`}
              disabled={isProviderSelectDisabled}
              placeholder={
                providersLoading
                  ? "Cargando proveedores..."
                  : "Buscar proveedor"
              }
            />
            <Search
              className={`absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                isProviderSelectDisabled && providerDisabledTooltip
                  ? "text-gray-500"
                  : "text-[var(--muted-foreground)]"
              }`}
            />
            {isProviderSelectDisabled && providerDisabledTooltip && (
              <div className="absolute bottom-full left-0 right-0 mb-2 mx-auto w-fit max-w-[90vw] sm:max-w-sm px-3 py-2 bg-yellow-500 text-black text-sm font-medium rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity text-center z-50 pointer-events-none">
                ⚠️ {providerDisabledTooltip}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-yellow-500"></div>
              </div>
            )}
            {isDropdownOpen &&
              filteredProviders.length > 0 &&
              !isProviderSelectDisabled && (
                <div className="absolute z-10 w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded mt-1">
                  {filteredProviders.map((p) => (
                    <div
                      key={p.code}
                      className="p-2 hover:bg-blue-400 cursor-pointer transition-all duration-200"
                      onMouseDown={() => {
                        onProviderChange(p.code);
                        setFilter(`${p.name} (${p.code})`);
                        setIsDropdownOpen(false);
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault();
                        onProviderChange(p.code);
                        setFilter(`${p.name} (${p.code})`);
                        setIsDropdownOpen(false);
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        {(() => {
                          const category = getProviderCategory(p.type);
                          const isIngreso = category === "INGRESO";
                          const isEgreso = category === "EGRESO";
                          const isGasto = category === "GASTO";
                          return (
                            <div className="min-w-0 flex items-center gap-2">
                              {isIngreso && (
                                <ArrowDownRight className="w-4 h-4 text-green-500 shrink-0" />
                              )}
                              {(isEgreso || isGasto) && (
                                <ArrowUpRight className="w-4 h-4 text-red-500 shrink-0" />
                              )}
                              <div className="truncate text-[var(--foreground)]">
                                {p.name} ({p.code})
                              </div>
                            </div>
                          );
                        })()}

                        {p.type && (
                          <span className="text-xs text-[var(--muted-foreground)] opacity-70 shrink-0">
                            {formatMovementType(p.type)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
          {providerError && (
            <p className="text-red-500 text-xs mt-1">{providerError}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Numero factura
          </label>
          <input
            placeholder="0000"
            value={invoiceNumber}
            onChange={(event) => onInvoiceNumberChange(event.target.value)}
            onKeyDown={onFieldKeyDown}
            className={`w-full p-2 bg-[var(--input-bg)] border ${
              invoiceError ? "border-red-500" : invoiceBorderClass
            } rounded`}
            disabled={invoiceDisabled}
          />
          {invoiceError && (
            <p className="text-red-500 text-xs mt-1">{invoiceError}</p>
          )}
        </div>

        {/* Tipo ya se determina por el proveedor seleccionado; no se muestra selector aquí */}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Monto
          </label>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="fg_currency"
                  value="CRC"
                  checked={currency === "CRC"}
                  onChange={() => onCurrencyChange && onCurrencyChange("CRC")}
                  className="accent-[var(--accent)]"
                  disabled={!currencyEnabled.CRC}
                />
                <span
                  className={`text-xs ${
                    currencyEnabled.CRC
                      ? "text-[var(--muted-foreground)]"
                      : "text-[var(--muted-foreground)]/60"
                  }`}
                >
                  Colones (₡){!currencyEnabled.CRC && " (desactivado)"}
                </span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="fg_currency"
                  value="USD"
                  checked={currency === "USD"}
                  onChange={() => onCurrencyChange && onCurrencyChange("USD")}
                  className="accent-[var(--accent)]"
                  disabled={!currencyEnabled.USD}
                />
                <span
                  className={`text-xs ${
                    currencyEnabled.USD
                      ? "text-[var(--muted-foreground)]"
                      : "text-[var(--muted-foreground)]/60"
                  }`}
                >
                  Dólares ($){!currencyEnabled.USD && " (desactivado)"}
                </span>
              </label>
            </div>
            <input
              placeholder="0"
              value={formatInputDisplay(isEgreso ? egreso : ingreso)}
              onChange={(event) => {
                const digits = extractDigits(event.target.value);
                if (isEgreso) onEgresoChange(digits);
                else onIngresoChange(digits);
              }}
              onKeyDown={onFieldKeyDown}
              className={`flex-1 p-2 bg-[var(--input-bg)] border ${
                amountError
                  ? "border-red-500"
                  : isEgreso
                  ? egresoBorderClass
                  : ingresoBorderClass
              } rounded ${
                currencyEnabled[currency] ? "" : "opacity-50 cursor-not-allowed"
              }`}
              inputMode="numeric"
              disabled={!currencyEnabled[currency]}
            />
          </div>
          {amountError && (
            <p className="text-red-500 text-xs mt-1">{amountError}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Observacion
          </label>
          <input
            placeholder="Observacion"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            onKeyDown={onFieldKeyDown}
            className="w-full p-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded"
            maxLength={200}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Encargado
          </label>
          <select
            value={manager}
            onChange={(event) => onManagerChange(event.target.value)}
            onKeyDown={onFieldKeyDown}
            className={`w-full p-2 bg-[var(--input-bg)] border ${
              managerError ? "border-red-500" : "border-[var(--input-border)]"
            } rounded`}
            disabled={managerSelectDisabled}
          >
            <option value="">
              {employeesLoading
                ? "Cargando encargados..."
                : "Seleccionar encargado"}
            </option>
            {employeeOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {managerError && (
            <p className="text-red-500 text-xs mt-1">{managerError}</p>
          )}
        </div>
      </div>

      <div className="flex justify-center gap-2">
        {editingEntryId && (
          <button
            type="button"
            className="px-4 py-2 border border-[var(--input-border)] rounded text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
            onClick={onCancelEditing}
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          className="px-4 py-2 bg-blue-400 text-white rounded hover:bg-blue-500 disabled:opacity-50 inline-flex items-center gap-2"
          onClick={onSubmit}
          disabled={isSubmitDisabled || isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              {editingEntryId ? "Actualizar" : "Guardar"}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default AgregarMovimiento;
