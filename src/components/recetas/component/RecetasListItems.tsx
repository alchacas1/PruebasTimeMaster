"use client";

import React from "react";
import { Pencil, Trash2 } from "lucide-react";

import type { ProductEntry, RecetaEntry } from "@/types/firestore";

const formatNumber = (value: number, maxDecimals = 2, minDecimals = 0): string => {
    if (!Number.isFinite(value)) return "0";
    return new Intl.NumberFormat("es-CR", {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
    }).format(value);
};

const roundCurrency = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
};

export function RecetasListItems(props: {
    recetas: RecetaEntry[];
    productosById: Record<string, ProductEntry>;
    saving: boolean;
    deletingId: string | null;
    onEdit: (receta: RecetaEntry) => void;
    onRemove: (id: string, nombreLabel: string) => void;
}) {
    const { recetas, productosById, saving, deletingId, onEdit, onRemove } = props;
    const [collapsedById, setCollapsedById] = React.useState<Record<string, boolean>>({});

    return (
        <>
            {recetas.map((r) => (
                (() => {
                    const margen = Number(r.margen) || 0;
                    const ivaRate = Number(r.iva) || 0;
                    const isProductsCollapsed = collapsedById[r.id] ?? true;
                    const ingredientes = (Array.isArray(r.productos) ? r.productos : []).map((item) => {
                        const productId = String(item.productId || "").trim();
                        const gramos = Number(item.gramos) || 0;
                        const product = productId ? productosById[productId] : undefined;
                        const precioXGramo = Number(product?.precioxgramo) || 0;
                        const costo = gramos > 0 && precioXGramo > 0 ? gramos * precioXGramo : 0;
                        return {
                            productId,
                            gramos,
                            product,
                            precioXGramo,
                            costo,
                        };
                    });

                    const costoTotal = ingredientes.reduce((sum, i) => sum + (Number(i.costo) || 0), 0);
                    const ivaMonto = costoTotal * ivaRate;
                    const totalConIva = costoTotal + ivaMonto;
                    const precioFinal = totalConIva * (1 + margen);
                    const productosCount = r.productos?.length || 0;
                    const margenLabel = `${Math.round(margen * 100)}%`;
                    const ivaLabel = `${Math.round(ivaRate * 100)}%`;
                    const costoLabel = `₡ ${formatNumber(roundCurrency(costoTotal), 2)}`;
                    const precioLabel = `₡ ${formatNumber(roundCurrency(precioFinal), 2)}`;

                    return (
                        <li
                            key={r.id}
                            className="group border border-[var(--input-border)] rounded-lg overflow-hidden bg-[var(--input-bg)] transition-colors duration-150 hover:bg-[var(--muted)] focus-within:ring-2 focus-within:ring-[var(--accent)]/40"
                        >
                            <div className="p-5 sm:p-6 min-w-0">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-base sm:text-lg font-semibold text-[var(--foreground)] truncate">
                                            {r.nombre}
                                        </div>

                                        {r.descripcion && (
                                            <div className="mt-1.5 text-xs sm:text-sm text-[var(--muted-foreground)]/80 break-words leading-snug">
                                                {r.descripcion}
                                            </div>
                                        )}

                                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted-foreground)]">
                                            <span className="whitespace-nowrap">{productosCount} productos</span>
                                            <span className="text-[var(--muted-foreground)]/50">|</span>
                                            <span className="whitespace-nowrap">
                                                Costo <span className="text-[var(--foreground)]">{costoLabel}</span>
                                            </span>
                                            <span className="text-[var(--muted-foreground)]/50">|</span>
                                            <span className="whitespace-nowrap font-semibold text-[var(--foreground)]">
                                                Precio {precioLabel}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="shrink-0 flex items-start gap-2">
                                        <div className="flex flex-col gap-1 items-end">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-[var(--muted-foreground)]">Margen</span>
                                                <div className="inline-flex items-center rounded-full bg-[var(--badge-bg)] text-[var(--badge-text)] px-2.5 py-1 text-xs font-semibold whitespace-nowrap ring-1 ring-[var(--input-border)]/60">
                                                    {margenLabel}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-[var(--muted-foreground)]">IVA</span>
                                                <div className="inline-flex items-center rounded-full bg-[var(--badge-bg)] text-[var(--badge-text)] px-2.5 py-1 text-xs font-semibold whitespace-nowrap ring-1 ring-[var(--input-border)]/60">
                                                    {ivaLabel}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-center gap-1 rounded-lg bg-black/5 dark:bg-white/5 p-1 ring-1 ring-black/10 dark:ring-white/10">
                                            <button
                                                type="button"
                                                className="opacity-70 hover:opacity-100 disabled:opacity-40 p-2.5 rounded-md hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 transition-all duration-150 transform-gpu hover:scale-[1.08]"
                                                onClick={() => onEdit(r)}
                                                disabled={saving || deletingId !== null}
                                                title="Editar receta"
                                                aria-label="Editar receta"
                                            >
                                                <Pencil className="w-4 h-4 text-[var(--foreground)]" />
                                            </button>
                                            <button
                                                type="button"
                                                className="opacity-70 hover:opacity-100 disabled:opacity-40 p-2.5 rounded-md hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 transition-all duration-150 transform-gpu hover:scale-[1.08]"
                                                onClick={() => onRemove(r.id, r.nombre || r.id)}
                                                disabled={saving || deletingId !== null}
                                                title="Eliminar receta"
                                                aria-label="Eliminar receta"
                                            >
                                                <Trash2 className="w-4 h-4 text-red-500" />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {ingredientes.length > 0 && (
                                    <div className="mt-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-[10px] sm:text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
                                                Productos
                                            </div>
                                            <button
                                                type="button"
                                                className="text-xs px-2.5 py-1 rounded-md border border-[var(--input-border)] hover:bg-[var(--muted)] transition-colors"
                                                onClick={() =>
                                                    setCollapsedById((prev) => ({
                                                        ...prev,
                                                        [r.id]: !(prev[r.id] ?? true),
                                                    }))
                                                }
                                            >
                                                {isProductsCollapsed ? "Mostrar" : "Minimizar"}
                                            </button>
                                        </div>

                                        {!isProductsCollapsed && (
                                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {ingredientes.map((i, idx) => {
                                                    const displayName = String(i.product?.nombre || i.productId || "Producto");
                                                    const gramosLabel = i.gramos > 0 ? `${formatNumber(i.gramos, 0)} g` : "";
                                                    const unitLabel =
                                                        i.precioXGramo > 0
                                                            ? `₡ ${formatNumber(i.precioXGramo, 2, 2)}/g`
                                                            : "";
                                                    const meta = [gramosLabel, unitLabel].filter(Boolean).join(" • ");
                                                    const costoItemLabel =
                                                        i.costo > 0
                                                            ? `₡ ${formatNumber(roundCurrency(i.costo), 2)}`
                                                            : "—";

                                                    return (
                                                        <div
                                                            key={`${i.productId || "row"}-${idx}`}
                                                            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--input-border)] bg-black/5 dark:bg-white/5 px-3.5 py-2.5 transition-colors duration-150 hover:bg-black/10 dark:hover:bg-white/10"
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-medium text-[var(--foreground)]/90 truncate">
                                                                    {displayName}
                                                                </div>
                                                                {meta && (
                                                                    <div className="mt-0.5 text-xs text-[var(--muted-foreground)] truncate">
                                                                        {meta}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="shrink-0 text-xs font-semibold text-[var(--foreground)] whitespace-nowrap">
                                                                {costoItemLabel}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </li>
                    );
                })()
            ))}
        </>
    );
}
