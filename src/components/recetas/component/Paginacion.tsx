"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Paginacion(props: {
  totalItems: number;
  itemsPerPage: number | "all";
  setItemsPerPage: (value: number | "all") => void;
  currentPage: number;
  totalPages: number;
  setCurrentPage: (updater: (prev: number) => number) => void;
  disabled?: boolean;
}) {
  const {
    totalItems,
    itemsPerPage,
    setItemsPerPage,
    currentPage,
    totalPages,
    setCurrentPage,
    disabled = false,
  } = props;

  if (totalItems <= 0) return null;

  return (
    <div className="flex w-full sm:w-auto flex-wrap items-center justify-end gap-2">
      <select
        value={itemsPerPage}
        onChange={(e) => {
          const val = e.target.value;
          setItemsPerPage(val === "all" ? "all" : Number(val));
        }}
        className="w-24 px-2.5 py-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm text-[var(--foreground)]"
        aria-label="Items por página"
        title="Items por página"
        disabled={disabled}
      >
        <option value={10}>10</option>
        <option value={25}>25</option>
        <option value={50}>50</option>
        <option value="all">Todos</option>
      </select>

      {itemsPerPage !== "all" && (
        <>
          <button
            type="button"
            className="p-2 rounded border border-[var(--input-border)] text-[var(--foreground)] disabled:opacity-50"
            disabled={currentPage <= 1 || disabled}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            aria-label="Página anterior"
            title="Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">
            {currentPage} / {totalPages}
          </div>
          <button
            type="button"
            className="p-2 rounded border border-[var(--input-border)] text-[var(--foreground)] disabled:opacity-50"
            disabled={currentPage >= totalPages || disabled}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            aria-label="Página siguiente"
            title="Siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}
