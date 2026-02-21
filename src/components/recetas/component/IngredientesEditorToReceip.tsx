"use client";

import React from "react";

import ConfirmModal from "@/components/ui/ConfirmModal";
import type { ProductEntry } from "@/types/firestore";

export type IngredienteDraft = {
  rowId: string;
  productId: string;
  gramos: string;
};

function createRowId(): string {
  return typeof globalThis !== "undefined" &&
    "crypto" in globalThis &&
    typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createIngredientRow(values?: Partial<Pick<IngredienteDraft, "productId" | "gramos">>): IngredienteDraft {
  return {
    rowId: createRowId(),
    productId: values?.productId ?? "",
    gramos: values?.gramos ?? "",
  };
}

export function IngredientesEditorToReceip(props: {
  ingredientes: IngredienteDraft[];
  saving: boolean;

  activeIngredientIndex: number | null;
  setActiveIngredientIndex: (value: number | null) => void;
  setProductoSearchTerm: (value: string) => void;

  productoResults: ProductEntry[];
  productoSearching: boolean;
  productoSearchError: string | null;

  onAddIngredient: () => void;
  onRemoveIngredientByRowId: (rowId: string) => void;
  onUpdateIngredient: (index: number, patch: Partial<IngredienteDraft>) => void;
}) {
  const {
    ingredientes,
    saving,
    activeIngredientIndex,
    setActiveIngredientIndex,
    setProductoSearchTerm,
    productoResults,
    productoSearching,
    productoSearchError,
    onAddIngredient,
    onRemoveIngredientByRowId,
    onUpdateIngredient,
  } = props;

  const [confirmIngredientRemove, setConfirmIngredientRemove] = React.useState<{
    open: boolean;
    rowId: string;
    label: string;
  }>({ open: false, rowId: "", label: "" });

  React.useEffect(() => {
    if (!confirmIngredientRemove.open) return;
    const stillExists = ingredientes.some((r) => r.rowId === confirmIngredientRemove.rowId);
    if (!stillExists) setConfirmIngredientRemove({ open: false, rowId: "", label: "" });
  }, [confirmIngredientRemove.open, confirmIngredientRemove.rowId, ingredientes]);

  const openRemoveIngredientModal = (row: IngredienteDraft) => {
    const idLabel = String(row.productId || "").trim();
    setConfirmIngredientRemove({
      open: true,
      rowId: row.rowId,
      label: idLabel ? `"${idLabel}"` : "este producto",
    });
  };

  const closeRemoveIngredientModal = () => {
    setConfirmIngredientRemove({ open: false, rowId: "", label: "" });
  };

  const confirmRemoveIngredient = () => {
    const rowId = confirmIngredientRemove.rowId;
    if (!rowId) return;
    onRemoveIngredientByRowId(rowId);
    closeRemoveIngredientModal();
  };

  return (
    <>
      <ConfirmModal
        open={confirmIngredientRemove.open}
        title="Quitar producto"
        message={`Quieres quitar ${confirmIngredientRemove.label} de esta receta?`}
        confirmText="Quitar"
        cancelText="Cancelar"
        actionType="delete"
        loading={false}
        onConfirm={confirmRemoveIngredient}
        onCancel={closeRemoveIngredientModal}
      />

      <div>
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
            Productos
          </div>
          <button
            onClick={onAddIngredient}
            className="text-sm px-3 py-1.5 rounded-md border border-[var(--input-border)] hover:bg-[var(--muted)] transition-colors"
            type="button"
            disabled={saving}
          >
            Agregar
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {ingredientes.map((row, index) => {
            const datalistId = `receta-productos-${index}`;
            return (
              <div key={row.rowId} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-7">
                  <label className="block text-xs text-[var(--muted-foreground)] mb-1">Producto</label>
                  <input
                    value={row.productId}
                    onChange={(e) => {
                      const value = e.target.value;
                      onUpdateIngredient(index, { productId: value });
                      setActiveIngredientIndex(index);
                      setProductoSearchTerm(value);
                    }}
                    onFocus={() => {
                      setActiveIngredientIndex(index);
                      setProductoSearchTerm(row.productId);
                    }}
                    list={datalistId}
                    className="w-full p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm text-[var(--foreground)]"
                    placeholder="Busca por nombre (min 2 letras) y elige el id"
                    disabled={saving}
                  />
                  <datalist id={datalistId}>
                    {(activeIngredientIndex === index ? productoResults : []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </datalist>
                  {activeIngredientIndex === index && productoSearchError && (
                    <div className="text-xs text-red-400 mt-1">{productoSearchError}</div>
                  )}
                  {activeIngredientIndex === index && productoSearching && (
                    <div className="text-xs text-[var(--muted-foreground)] mt-1">Buscando…</div>
                  )}
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs text-[var(--muted-foreground)] mb-1">Gramos</label>
                  <input
                    value={row.gramos}
                    onChange={(e) => onUpdateIngredient(index, { gramos: e.target.value })}
                    className="w-full p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm text-[var(--foreground)]"
                    placeholder="Ej: 200"
                    inputMode="decimal"
                    disabled={saving}
                  />
                </div>

                <div className="sm:col-span-2 flex sm:justify-end">
                  <button
                    onClick={() => openRemoveIngredientModal(row)}
                    className="px-3 py-2 rounded-md border border-[var(--input-border)] hover:bg-[var(--muted)] transition-colors text-sm"
                    type="button"
                    disabled={saving || ingredientes.length <= 1}
                    title={ingredientes.length <= 1 ? "Debe quedar al menos 1 fila" : "Quitar"}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
