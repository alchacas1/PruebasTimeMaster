"use client";

import React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type Currency = "CRC" | "USD";

export type DailyClosingHistoryModalProps = {
  open: boolean;
  onClose: () => void;
  closingsAreLoading: boolean;
  dailyClosings: Array<any>;
  visibleDailyClosings: Array<any>;
  dailyClosingDateFormatter: Intl.DateTimeFormat;
  dateTimeFormatter: Intl.DateTimeFormat;
  buildBreakdownLines: (currency: Currency, breakdown: any) => string[];
  formatByCurrency: (currency: Currency, value: number) => string;
  formatDailyClosingDiff: (currency: Currency, value: number) => string;
  getDailyClosingDiffClass: (value: number) => string;
  fondoEntries: Array<any>;
  isAutoAdjustmentProvider: (providerCode: unknown) => boolean;
  expandedClosings: Set<string>;
  setExpandedClosings: React.Dispatch<React.SetStateAction<Set<string>>>;
};

export default function DailyClosingHistoryModal({
  open,
  onClose,
  closingsAreLoading,
  dailyClosings,
  visibleDailyClosings,
  dailyClosingDateFormatter,
  dateTimeFormatter,
  buildBreakdownLines,
  formatByCurrency,
  formatDailyClosingDiff,
  getDailyClosingDiffClass,
  fondoEntries,
  isAutoAdjustmentProvider,
  expandedClosings,
  setExpandedClosings,
}: DailyClosingHistoryModalProps) {
  if (!open) return null;

  const [quickRange, setQuickRange] = React.useState<string>("todo");

  const filteredClosings = React.useMemo(() => {
    const list = visibleDailyClosings || [];
    if (!quickRange || quickRange === "todo") return list;

    const now = new Date();
    let from: Date | null = null;
    let to: Date | null = null;

    if (quickRange === "today") {
      const t = new Date(now);
      from = t;
      to = t;
    } else if (quickRange === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      from = y;
      to = y;
    } else if (quickRange === "thisweek") {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const start = new Date(d);
      start.setDate(diff);
      from = start;
      to = new Date(now);
    } else if (quickRange === "lastweek") {
      const d = new Date(now);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1) - 7;
      const start = new Date(d);
      start.setDate(diff);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      from = start;
      to = end;
    } else if (quickRange === "lastmonth") {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      from = first;
      to = last;
    } else if (quickRange === "month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      from = first;
      to = last;
    } else if (quickRange === "last30") {
      const end = new Date(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      from = start;
      to = end;
    }

    if (!from || !to) return list;

    const fromTs = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0, 0).getTime();
    const toTs = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).getTime();

    return list.filter((record) => {
      const d = new Date(record?.closingDate);
      const ts = d.getTime();
      if (Number.isNaN(ts)) return true;
      if (ts < fromTs) return false;
      if (ts > toTs) return false;
      return true;
    });
  }, [visibleDailyClosings, quickRange]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded border border-[var(--input-border)] bg-[#1f262a] p-4 sm:p-6 shadow-lg text-white max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-closing-history-title"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="daily-closing-history-title" className="text-lg font-semibold">
            Historial de cierres diarios
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[var(--input-border)] px-2 py-1 text-sm"
          >
            Cerrar
          </button>
        </div>

        <div className="mb-4 rounded border border-[var(--input-border)] bg-[var(--muted)]/5 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:max-w-xs">
              <label className="block text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-1">
                Filtro de fecha
              </label>
              <select
                className="w-full rounded-md border border-[var(--input-border)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                style={{
                  backgroundColor: "var(--card-bg)",
                  color: "var(--foreground)",
                }}
                value={quickRange}
                onChange={(e) => setQuickRange(e.target.value)}
              >
                <option value="todo">Todo</option>
                <option value="today">Hoy</option>
                <option value="yesterday">Ayer</option>
                <option value="thisweek">Esta semana</option>
                <option value="lastweek">Semana anterior</option>
                <option value="lastmonth">Mes anterior</option>
                <option value="last30">Últimos 30 días</option>
                <option value="month">Mes actual</option>
              </select>
            </div>

            {!closingsAreLoading && dailyClosings.length > 0 && (
              <div className="text-xs text-[var(--muted-foreground)] sm:text-right">
                Mostrando {filteredClosings.length} de {visibleDailyClosings.length}.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {closingsAreLoading ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Cargando cierres...
            </p>
          ) : dailyClosings.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Aún no has registrado cierres diarios para este fondo.
            </p>
          ) : (
            <div className="space-y-4">
              {filteredClosings.map((record) => {
                const closingDate = new Date(record.closingDate);
                const closingDateLabel = Number.isNaN(closingDate.getTime())
                  ? record.closingDate
                  : dailyClosingDateFormatter.format(closingDate);
                const createdAtDate = new Date(record.createdAt);
                const createdAtLabel = Number.isNaN(createdAtDate.getTime())
                  ? record.createdAt
                  : dateTimeFormatter.format(createdAtDate);
                const crcLines = buildBreakdownLines("CRC", record.breakdownCRC);
                const usdLines = buildBreakdownLines("USD", record.breakdownUSD);
                const showCRC =
                  record.totalCRC !== 0 ||
                  record.recordedBalanceCRC !== 0 ||
                  record.diffCRC !== 0 ||
                  crcLines.length > 0;
                const showUSD =
                  record.totalUSD !== 0 ||
                  record.recordedBalanceUSD !== 0 ||
                  record.diffUSD !== 0 ||
                  usdLines.length > 0;

                return (
                  <div
                    key={record.id}
                    className="rounded border border-[var(--input-border)] bg-[var(--muted)]/10 p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-semibold text-[var(--foreground)]">
                          {closingDateLabel}
                        </div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          Registrado: {createdAtLabel}
                        </div>
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        Encargado:{" "}
                        <span className="font-medium text-[var(--foreground)]">
                          {record.manager || "—"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="rounded border border-[var(--input-border)]/60 bg-[var(--muted)]/10 p-3">
                        <div className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                          Colones
                        </div>
                        {showCRC ? (
                          <div className="mt-2 space-y-1 text-sm text-[var(--foreground)]">
                            <div>Conteo: {formatByCurrency("CRC", record.totalCRC)}</div>
                            <div>
                              Saldo registrado:{" "}
                              {formatByCurrency("CRC", record.recordedBalanceCRC)}
                            </div>
                            <div className={getDailyClosingDiffClass(record.diffCRC)}>
                              Diferencia: {formatDailyClosingDiff("CRC", record.diffCRC)}
                            </div>
                            {crcLines.length > 0 && (
                              <div className="pt-1 text-xs text-[var(--muted-foreground)]">
                                Detalle: {crcLines.join(", ")}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                            Sin datos en CRC
                          </div>
                        )}
                      </div>

                      <div className="rounded border border-[var(--input-border)]/60 bg-[var(--muted)]/10 p-3">
                        <div className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">
                          Dólares
                        </div>
                        {showUSD ? (
                          <div className="mt-2 space-y-1 text-sm text-[var(--foreground)]">
                            <div>Conteo: {formatByCurrency("USD", record.totalUSD)}</div>
                            <div>
                              Saldo registrado:{" "}
                              {formatByCurrency("USD", record.recordedBalanceUSD)}
                            </div>
                            <div className={getDailyClosingDiffClass(record.diffUSD)}>
                              Diferencia: {formatDailyClosingDiff("USD", record.diffUSD)}
                            </div>
                            {usdLines.length > 0 && (
                              <div className="pt-1 text-xs text-[var(--muted-foreground)]">
                                Detalle: {usdLines.join(", ")}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                            Sin datos en USD
                          </div>
                        )}
                      </div>
                    </div>

                    {record.notes && record.notes.length > 0 && (
                      <div className="mt-3 text-xs text-[var(--muted-foreground)]">
                        Notas: {record.notes}
                      </div>
                    )}

                    {/* Show related adjustment movements or an edited/resolved indicator */}
                    {(() => {
                      const relatedAdjustments = fondoEntries.filter(
                        (e) =>
                          e.originalEntryId === record.id &&
                          isAutoAdjustmentProvider(e.providerCode)
                      );

                      if (
                        relatedAdjustments.length === 0 &&
                        record.diffCRC === 0 &&
                        record.diffUSD === 0
                      ) {
                        const isExpanded = expandedClosings.has(record.id);
                        return (
                          <div className="mt-3">
                            <div className="flex items-center justify-between p-3 rounded border-l-4 border-green-500 bg-green-900/5 text-sm">
                              <div>
                                <div className="font-medium">
                                  Cierre editado — diferencias resueltas
                                </div>
                                <div className="text-xs text-[var(--muted-foreground)]">
                                  Los ajustes previos fueron eliminados y el saldo
                                  quedó normalizado.
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedClosings((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(record.id)) next.delete(record.id);
                                    else next.add(record.id);
                                    return next;
                                  });
                                }}
                                aria-expanded={isExpanded}
                                aria-controls={`closing-resolved-${record.id}`}
                                className="ml-4 p-1 rounded border border-transparent hover:border-[var(--input-border)]"
                                title={isExpanded ? "Ocultar detalles" : "Mostrar detalles"}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                            </div>

                            {isExpanded && (
                              <div
                                id={`closing-resolved-${record.id}`}
                                className="mt-2 p-3 rounded border border-[var(--input-border)] bg-[var(--muted)]/5 text-sm text-[var(--muted-foreground)]"
                              >
                                <div className="mb-2">
                                  <div>
                                    <strong>Conteo:</strong>{" "}
                                    {formatByCurrency("CRC", record.totalCRC)} /{" "}
                                    {formatByCurrency("USD", record.totalUSD)}
                                  </div>
                                  <div>
                                    <strong>Saldo registrado:</strong>{" "}
                                    {formatByCurrency(
                                      "CRC",
                                      record.recordedBalanceCRC
                                    )} /{" "}
                                    {formatByCurrency(
                                      "USD",
                                      record.recordedBalanceUSD
                                    )}
                                  </div>
                                  <div>
                                    <strong>Diferencia:</strong>{" "}
                                    {record.diffCRC === 0 && record.diffUSD === 0
                                      ? "Sin diferencias"
                                      : `${formatDailyClosingDiff(
                                          "CRC",
                                          record.diffCRC
                                        )} / ${formatDailyClosingDiff(
                                          "USD",
                                          record.diffUSD
                                        )}`}
                                  </div>
                                </div>
                                <div className="text-xs text-[var(--input-border)]">
                                  <div className="mb-1 font-medium">
                                    Resumen de resolución:
                                  </div>
                                  {record.adjustmentResolution?.removedAdjustments &&
                                  record.adjustmentResolution.removedAdjustments
                                    .length > 0 ? (
                                    <ul className="list-disc pl-5 text-[var(--muted-foreground)]">
                                      {record.adjustmentResolution.removedAdjustments.map(
                                        (adj: any, idx: number) => (
                                          <li key={idx}>
                                            {adj.currency}: {" "}
                                            {adj.amount && adj.amount !== 0
                                              ? adj.amount > 0
                                                ? `+ ${formatByCurrency(
                                                    adj.currency as Currency,
                                                    adj.amount
                                                  )}`
                                                : `- ${formatByCurrency(
                                                    adj.currency as Currency,
                                                    Math.abs(adj.amount)
                                                  )}`
                                              : `${formatByCurrency(
                                                  adj.currency as Currency,
                                                  (adj.amountIngreso || 0) -
                                                    (adj.amountEgreso || 0)
                                                )}`}
                                            {adj.manager ? ` — ${adj.manager}` : ""}
                                            {adj.createdAt
                                              ? ` • ${(() => {
                                                  try {
                                                    return dateTimeFormatter.format(
                                                      new Date(adj.createdAt)
                                                    );
                                                  } catch {
                                                    return adj.createdAt;
                                                  }
                                                })()}`
                                              : ""}
                                          </li>
                                        )
                                      )}
                                    </ul>
                                  ) : (
                                    <ul className="list-disc pl-5 text-[var(--muted-foreground)]">
                                      <li>
                                        Los ajustes asociados a este cierre fueron
                                        eliminados manualmente.
                                      </li>
                                      <li>
                                        El saldo del fondo quedó normalizado contra
                                        el conteo proporcionado.
                                      </li>
                                    </ul>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (relatedAdjustments.length > 0) {
                        const postAdjBalanceCRC =
                          record.adjustmentResolution?.postAdjustmentBalanceCRC;
                        const postAdjBalanceUSD =
                          record.adjustmentResolution?.postAdjustmentBalanceUSD;
                        const showPostAdjustmentBalances =
                          typeof postAdjBalanceCRC === "number" ||
                          typeof postAdjBalanceUSD === "number";

                        return (
                          <div className="mt-3">
                            <div className="text-sm font-medium mb-2">
                              Ajustes relacionados
                            </div>
                            <div className="space-y-2">
                              {relatedAdjustments.map((adj) => {
                                const amt =
                                  (adj.amountIngreso || 0) - (adj.amountEgreso || 0);
                                let auditHistory: any[] = [];
                                try {
                                  const parsed = adj.auditDetails
                                    ? (JSON.parse(adj.auditDetails) as any)
                                    : null;
                                  if (parsed) {
                                    if (Array.isArray(parsed.history))
                                      auditHistory = parsed.history.slice();
                                    else if (parsed.before && parsed.after)
                                      auditHistory = [
                                        {
                                          at: parsed.at ?? adj.createdAt,
                                          before: parsed.before,
                                          after: parsed.after,
                                        },
                                      ];
                                  }
                                } catch {
                                  auditHistory = [];
                                }

                                const lastChange =
                                  auditHistory.length > 0
                                    ? auditHistory[auditHistory.length - 1]
                                    : null;

                                return (
                                  <div
                                    key={adj.id}
                                    className="p-3 rounded border border-[var(--input-border)] bg-[var(--muted)]/10"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="font-semibold">
                                        {adj.currency} — {amt >= 0 ? "+" : "-"}{" "}
                                        {formatByCurrency(
                                          adj.currency as Currency,
                                          Math.abs(amt)
                                        )}
                                      </div>
                                      <div className="text-xs text-[var(--muted-foreground)]">
                                        {adj.manager || "—"} •{" "}
                                        {(() => {
                                          try {
                                            return dateTimeFormatter.format(
                                              new Date(adj.createdAt)
                                            );
                                          } catch {
                                            return adj.createdAt;
                                          }
                                        })()}
                                      </div>
                                    </div>

                                    {adj.breakdown &&
                                      Object.keys(adj.breakdown).length > 0 && (
                                        <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                                          <div className="font-medium">
                                            Detalle de billetes:
                                          </div>
                                          <div className="text-xs mt-1">
                                            {buildBreakdownLines(
                                              adj.currency as Currency,
                                              adj.breakdown
                                            ).join(", ")}
                                          </div>
                                        </div>
                                      )}

                                    {lastChange ? (
                                      <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                                        <div className="font-medium">
                                          Último cambio registrado:
                                        </div>
                                        <div>
                                          Antes:{" "}
                                          {(() => {
                                            const beforeAmt = lastChange.before
                                              ? (lastChange.before.amountIngreso || 0) -
                                                (lastChange.before.amountEgreso || 0)
                                              : undefined;
                                            return typeof beforeAmt === "number"
                                              ? formatByCurrency(
                                                  adj.currency as Currency,
                                                  Math.abs(beforeAmt)
                                                )
                                              : "—";
                                          })()}
                                        </div>
                                        <div>
                                          Después:{" "}
                                          {(() => {
                                            const afterAmt = lastChange.after
                                              ? (lastChange.after.amountIngreso || 0) -
                                                (lastChange.after.amountEgreso || 0)
                                              : undefined;
                                            return typeof afterAmt === "number"
                                              ? formatByCurrency(
                                                  adj.currency as Currency,
                                                  Math.abs(afterAmt)
                                                )
                                              : "—";
                                          })()}
                                        </div>
                                        {lastChange.at && (
                                          <div className="text-[11px] text-[var(--muted-foreground)] mt-1">
                                            Registro:{" "}
                                            {dateTimeFormatter.format(
                                              new Date(lastChange.at)
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                                        Movimiento sin historial de edición.
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {showPostAdjustmentBalances && (
                              <div className="mt-3 text-xs text-[var(--muted-foreground)]">
                                <div className="font-medium text-[var(--muted-foreground)]">
                                  Saldo posterior a ajustes
                                </div>
                                {typeof postAdjBalanceCRC === "number" && (
                                  <div>
                                    CRC: {formatByCurrency("CRC", postAdjBalanceCRC)}
                                  </div>
                                )}
                                {typeof postAdjBalanceUSD === "number" && (
                                  <div>
                                    USD: {formatByCurrency("USD", postAdjBalanceUSD)}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return null;
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
