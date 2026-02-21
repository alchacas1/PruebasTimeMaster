"use client";

import React from "react";

import type { ProductEntry, RecetaEntry } from "@/types/firestore";
import { RecetasListItems } from "@/components/recetas/component/RecetasListItems";

export function RecetasListContent(props: {
    isLoading: boolean;
    filteredCount: number;
    searchTerm: string;
    recetas: RecetaEntry[];
    productosById: Record<string, ProductEntry>;
    saving: boolean;
    deletingId: string | null;
    onEdit: (receta: RecetaEntry) => void;
    onRemove: (id: string, nombreLabel: string) => void;
}) {
    const {
        isLoading,
        filteredCount,
        searchTerm,
        recetas,
        productosById,
        saving,
        deletingId,
        onEdit,
        onRemove,
    } = props;

    if (isLoading) {
        return (
            <ul className="space-y-2">
                {Array.from({ length: 6 }).map((_, idx) => (
                    <li
                        key={idx}
                        className="animate-pulse flex flex-col sm:flex-row sm:items-stretch border border-[var(--input-border)] rounded-lg overflow-hidden bg-[var(--input-bg)]"
                    >
                        <div className="flex-1 p-4 sm:p-5 min-w-0">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <div className="h-4 w-1/2 rounded bg-black/20" />
                                    <div className="mt-3 h-3 w-3/4 rounded bg-black/15" />
                                </div>
                                <div className="text-right">
                                    <div className="h-4 w-20 rounded bg-black/20 ml-auto" />
                                    <div className="mt-2 h-3 w-28 rounded bg-black/15 ml-auto" />
                                </div>
                            </div>
                        </div>
                        <div className="px-3 py-3 sm:px-3 sm:py-3 border-t sm:border-t-0 sm:border-l border-[var(--input-border)] bg-black/10">
                            <div className="h-8 w-20 rounded bg-black/20" />
                        </div>
                    </li>
                ))}
            </ul>
        );
    }

    return (
        <ul className="space-y-1.5 sm:space-y-2">
            {filteredCount === 0 && (
                <li className="border border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] p-6 text-center">
                    <div className="text-sm font-semibold text-[var(--foreground)]">
                        {searchTerm ? "Sin resultados" : "Aún no hay recetas"}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                        {searchTerm
                            ? "Prueba con otro nombre o descripción."
                            : "Agrega tu primera receta para empezar."}
                    </div>
                </li>
            )}

            <RecetasListItems
                recetas={recetas}
                productosById={productosById}
                saving={saving}
                deletingId={deletingId}
                onEdit={onEdit}
                onRemove={onRemove}
            />
        </ul>
    );
}
