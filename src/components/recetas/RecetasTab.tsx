"use client";

import React from "react";
import { RightDrawer } from "@/components/ui/RightDrawer";

import { useAuth } from "@/hooks/useAuth";
import { useActorOwnership } from "@/hooks/useActorOwnership";
import { getDefaultPermissions } from "@/utils/permissions";
import useToast from "@/hooks/useToast";
import { useRecetas } from "@/hooks/useRecetas";
import { useProductos } from "@/hooks/useProductos";
import type { ProductEntry, RecetaEntry } from "@/types/firestore";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { EmpresaSearchAddSection } from "@/components/recetas/component/EmpresaSearchAddSection";
import {
    IngredientesEditorToReceip,
    createIngredientRow,
    type IngredienteDraft,
} from "@/components/recetas/component/IngredientesEditorToReceip";
import { Paginacion } from "@/components/recetas/component/Paginacion";
import { RecetasListContent } from "@/components/recetas/component/RecetasListContent";

function sanitizeNumber(value: string): number {
    const trimmed = String(value || "").trim().replace(/,/g, ".");
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
}

function useDebouncedValue<T>(value: T, delayMs: number) {
    const [debounced, setDebounced] = React.useState(value);
    React.useEffect(() => {
        const handle = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(handle);
    }, [value, delayMs]);
    return debounced;
}

export function RecetasTab() {
    const { user, loading: authLoading } = useAuth();
    const { ownerIds: actorOwnerIds } = useActorOwnership(user || {});
    const permissions = user?.permissions || getDefaultPermissions(user?.role || "user");
    const canUseRecetas = Boolean(permissions.recetas);
    const companyFromUser = String(user?.ownercompanie || "").trim();
    const isAdminLike = user?.role === "admin" || user?.role === "superadmin";

    const [empresaError, setEmpresaError] = React.useState<string | null>(null);
    const [selectedEmpresa, setSelectedEmpresa] = React.useState<string>("");

    const company = isAdminLike ? selectedEmpresa : companyFromUser;

    const { showToast } = useToast();
    const { recetas, loading, error, addReceta, updateReceta, removeReceta } = useRecetas({
        companyOverride: isAdminLike ? selectedEmpresa : undefined,
    });

    const {
        productos,
        loading: productosLoading,
        error: productosError,
    } = useProductos({ companyOverride: isAdminLike ? selectedEmpresa : undefined });

    const productosById = React.useMemo(() => {
        const map: Record<string, ProductEntry> = {};
        for (const p of productos) {
            if (!p?.id) continue;
            map[p.id] = p;
        }
        return map;
    }, [productos]);

    const [searchTerm, setSearchTerm] = React.useState("");

    const [nombre, setNombre] = React.useState("");
    const [descripcion, setDescripcion] = React.useState("");
    const [iva, setIva] = React.useState("0.13");
    const [margen, setMargen] = React.useState("0.35");
    const [drawerOpen, setDrawerOpen] = React.useState(false);
    const [editingRecetaId, setEditingRecetaId] = React.useState<string | null>(null);
    const [ingredientes, setIngredientes] = React.useState<IngredienteDraft[]>([
        createIngredientRow(),
    ]);
    const [saving, setSaving] = React.useState(false);
    const [formError, setFormError] = React.useState<string | null>(null);
    const [deletingId, setDeletingId] = React.useState<string | null>(null);

    const [itemsPerPage, setItemsPerPage] = React.useState<number | "all">(10);
    const [currentPage, setCurrentPage] = React.useState(1);

    const [confirmState, setConfirmState] = React.useState<{
        open: boolean;
        id: string;
        nombre: string;
    }>({ open: false, id: "", nombre: "" });

    // Búsqueda optimizada de productos: solo consulta por prefijo mientras el usuario escribe.
    const [activeIngredientIndex, setActiveIngredientIndex] = React.useState<number | null>(null);
    const [productoSearchTerm, setProductoSearchTerm] = React.useState("");
    const debouncedSearch = useDebouncedValue(productoSearchTerm, 250);
    const [productoResults, setProductoResults] = React.useState<ProductEntry[]>([]);
    const [productoSearching, setProductoSearching] = React.useState(false);
    const [productoSearchError, setProductoSearchError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!company) {
            setProductoResults([]);
            setProductoSearchError(null);
            setProductoSearching(false);
            return;
        }

        const term = String(debouncedSearch || "").trim().toLowerCase();
        if (term.length < 2) {
            setProductoResults([]);
            setProductoSearchError(null);
            setProductoSearching(false);
            return;
        }

        if (productosLoading) {
            setProductoResults([]);
            setProductoSearchError(null);
            setProductoSearching(true);
            return;
        }

        setProductoSearching(false);
        setProductoSearchError(null);

        const found = productos
            .filter((p) => (p?.nombre || "").toLowerCase().includes(term))
            .slice(0, 15);
        setProductoResults(found);
    }, [company, debouncedSearch, productos, productosLoading]);

    const isLoading = authLoading || loading || productosLoading;
    const resolvedError = formError || error || productosError || empresaError;

    const filteredRecetas = React.useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return recetas;
        return recetas.filter((r) => {
            const n = (r.nombre || "").toLowerCase();
            const d = (r.descripcion || "").toLowerCase();
            const i = (r.id || "").toLowerCase();
            return n.includes(term) || d.includes(term) || i.includes(term);
        });
    }, [recetas, searchTerm]);

    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, company]);

    const totalPages = React.useMemo(() => {
        if (itemsPerPage === "all") return 1;
        const total = Math.max(1, Math.ceil(filteredRecetas.length / itemsPerPage));
        return total;
    }, [filteredRecetas.length, itemsPerPage]);

    React.useEffect(() => {
        setCurrentPage((p) => Math.min(Math.max(1, p), totalPages));
    }, [totalPages]);

    const paginatedRecetas = React.useMemo(() => {
        if (itemsPerPage === "all") return filteredRecetas;
        const start = (currentPage - 1) * itemsPerPage;
        return filteredRecetas.slice(start, start + itemsPerPage);
    }, [currentPage, filteredRecetas, itemsPerPage]);

    const resetForm = () => {
        setNombre("");
        setDescripcion("");
        setIva("0.13");
        setMargen("0.35");
        setIngredientes([createIngredientRow()]);
        setFormError(null);
        setActiveIngredientIndex(null);
        setProductoSearchTerm("");
        setProductoResults([]);
        setProductoSearchError(null);
        setEditingRecetaId(null);
    };

    const openAddDrawer = () => {
        resetForm();
        setDrawerOpen(true);
    };

    const openEditDrawer = (receta: RecetaEntry) => {
        setFormError(null);
        setEditingRecetaId(receta.id);
        setNombre(String(receta.nombre || ""));
        setDescripcion(String(receta.descripcion || ""));
        setIva(String(typeof receta.iva === "number" ? receta.iva : 0.13));
        setMargen(String(typeof receta.margen === "number" ? receta.margen : 0));
        const nextIngredientes: IngredienteDraft[] = Array.isArray(receta.productos)
            ? receta.productos.map((p) => ({
                ...createIngredientRow({
                    productId: String(p.productId || ""),
                    gramos: String(p.gramos ?? ""),
                }),
            }))
            : [];
        setIngredientes(nextIngredientes.length > 0 ? nextIngredientes : [createIngredientRow()]);
        setActiveIngredientIndex(null);
        setProductoSearchTerm("");
        setProductoResults([]);
        setProductoSearchError(null);
        setDrawerOpen(true);
    };

    const closeAddDrawer = () => {
        setDrawerOpen(false);
        resetForm();
    };

    const addIngredientRow = () => {
        // Insertar al inicio (el nuevo producto/fila aparece arriba)
        setIngredientes((prev) => [createIngredientRow(), ...prev]);
        // Mantener enfocada la fila activa (las filas se desplazan +1)
        setActiveIngredientIndex((prev) => (prev === null ? null : prev + 1));
    };

    const removeIngredientRow = (index: number) => {
        setIngredientes((prev) => prev.filter((_, i) => i !== index));
        if (activeIngredientIndex === index) {
            setActiveIngredientIndex(null);
            setProductoSearchTerm("");
            setProductoResults([]);
        } else if (activeIngredientIndex !== null && index < activeIngredientIndex) {
            // Si se elimina una fila antes de la activa, la activa se desplaza -1
            setActiveIngredientIndex(activeIngredientIndex - 1);
        }
    };

    const removeIngredientRowByRowId = (rowId: string) => {
        const index = ingredientes.findIndex((r) => r.rowId === rowId);
        if (index >= 0) removeIngredientRow(index);
    };

    const updateIngredient = (index: number, patch: Partial<IngredienteDraft>) => {
        setIngredientes((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    const handleSave = async () => {
        if (saving) return;
        setFormError(null);

        if (!company) {
            setFormError("No se pudo determinar la empresa del usuario.");
            return;
        }

        const nombreTrim = nombre.trim();
        if (!nombreTrim) {
            setFormError("Nombre requerido.");
            return;
        }

        let margenValue = sanitizeNumber(margen);
        // Soportar entrada tipo "35" (porcentaje)
        if (margenValue > 1 && margenValue <= 100) {
            margenValue = margenValue / 100;
        }
        if (!(margenValue >= 0 && margenValue <= 1)) {
            setFormError("El margen debe estar entre 0 y 1 (ej: 0.35) o 0-100 (ej: 35).");
            return;
        }

        const ivaTrim = String(iva || "").trim();
        let ivaValue = ivaTrim ? sanitizeNumber(ivaTrim) : 0.13;
        // Soportar entrada tipo "13" (porcentaje)
        if (ivaValue > 1 && ivaValue <= 100) {
            ivaValue = ivaValue / 100;
        }
        if (!(ivaValue >= 0 && ivaValue <= 1)) {
            setFormError("El IVA debe estar entre 0 y 1 (ej: 0.13) o 0-100 (ej: 13).");
            return;
        }

        const productos = ingredientes
            .map((row) => ({
                productId: String(row.productId || "").trim(),
                gramos: sanitizeNumber(row.gramos),
            }))
            .filter((p) => p.productId && p.gramos > 0);

        if (productos.length === 0) {
            setFormError("Debe agregar al menos un producto con gramos > 0.");
            return;
        }

        try {
            setSaving(true);
            if (editingRecetaId) {
                await updateReceta(editingRecetaId, {
                    nombre: nombreTrim,
                    descripcion: descripcion.trim() ? descripcion.trim() : null,
                    iva: ivaValue,
                    margen: margenValue,
                    productos,
                });
                showToast("Receta actualizada.", "success");
            } else {
                await addReceta({
                    nombre: nombreTrim,
                    descripcion: descripcion.trim() ? descripcion.trim() : undefined,
                    iva: ivaValue,
                    margen: margenValue,
                    productos,
                });
                showToast("Receta creada.", "success");
            }
            resetForm();
            setDrawerOpen(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : "No se pudo guardar la receta.";
            setFormError(message);
            showToast(message, "error");
        } finally {
            setSaving(false);
        }
    };

    const openRemoveModal = (id: string, nombreLabel: string) => {
        setConfirmState({ open: true, id, nombre: nombreLabel });
    };

    const closeRemoveModal = () => {
        setConfirmState({ open: false, id: "", nombre: "" });
    };

    const confirmRemoveReceta = async () => {
        if (!confirmState.id) return;
        try {
            setDeletingId(confirmState.id);
            await removeReceta(confirmState.id);
            showToast("Receta eliminada.", "success");
            closeRemoveModal();
        } catch (err) {
            const message = err instanceof Error ? err.message : "No se pudo eliminar la receta.";
            showToast(message, "error");
        } finally {
            setDeletingId(null);
        }
    };

    if (!canUseRecetas) {
        return (
            <div className="max-w-3xl mx-auto bg-[var(--card-bg)] border border-[var(--input-border)] rounded-lg shadow p-8">
                <h2 className="text-2xl font-bold text-[var(--foreground)] mb-2">Recetas</h2>
                <p className="text-[var(--muted-foreground)]">No tienes permisos para usar Recetas.</p>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto bg-[var(--card-bg)] border border-[var(--input-border)] rounded-lg shadow p-4 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-sm sm:text-base font-medium text-[var(--muted-foreground)]">Recetas</h2>
                    <p className="text-[10px] sm:text-xs text-[var(--muted-foreground)]">Administra recetas para tu empresa.</p>
                </div>

                <EmpresaSearchAddSection
                    authLoading={authLoading}
                    isAdminLike={isAdminLike}
                    userRole={user?.role}
                    actorOwnerIds={actorOwnerIds}
                    companyFromUser={companyFromUser}
                    selectedEmpresa={selectedEmpresa}
                    setSelectedEmpresa={setSelectedEmpresa}
                    setEmpresaError={setEmpresaError}
                    onCompanyChanged={() => {
                        setSearchTerm("");
                        setCurrentPage(1);
                        setDrawerOpen(false);
                        resetForm();
                    }}
                    searchValue={searchTerm}
                    onSearchValueChange={setSearchTerm}
                    searchPlaceholder={isLoading ? "Cargando..." : "Buscar receta"}
                    searchAriaLabel="Buscar receta"
                    searchDisabled={isLoading}
                    addButtonText="Agregar receta"
                    onAddClick={openAddDrawer}
                    addDisabled={saving || isLoading || (isAdminLike && !selectedEmpresa)}
                />
            </div>

            {resolvedError && (
                <div className="mb-4 text-sm text-red-500">{resolvedError}</div>
            )}

            <RightDrawer
                open={drawerOpen}
                onClose={closeAddDrawer}
                title={editingRecetaId ? "Editar receta" : "Agregar receta"}
                footer={
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={closeAddDrawer}
                            className="px-4 py-2 border border-[var(--input-border)] rounded text-[var(--foreground)] hover:bg-[var(--muted)] bg-transparent"
                            disabled={saving}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            className="px-4 py-2 bg-[var(--accent)] text-white rounded disabled:opacity-50"
                            disabled={saving || isLoading || (isAdminLike && !selectedEmpresa)}
                        >
                            {saving ? "Guardando..." : editingRecetaId ? "Guardar cambios" : "Guardar receta"}
                        </button>
                    </div>
                }
            >
                {resolvedError && <div className="mb-4 text-sm text-red-400">{resolvedError}</div>}

                <div className="flex flex-col gap-4">
                    <div>
                        <div className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
                            Información básica
                        </div>
                        <div className="mt-3 flex flex-col gap-4">
                            <div>
                                <label className="block text-xs text-[var(--muted-foreground)] mb-1">Nombre</label>
                                <input
                                    className="w-full p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm text-[var(--foreground)]"
                                    placeholder="Ej: Hamburguesa clásica"
                                    value={nombre}
                                    onChange={(e) => setNombre(e.target.value)}
                                    disabled={saving}
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-[var(--muted-foreground)] mb-1">Descripción (opcional)</label>
                                <textarea
                                    className="w-full p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm text-[var(--foreground)] min-h-[90px]"
                                    placeholder="Notas o detalles"
                                    value={descripcion}
                                    onChange={(e) => setDescripcion(e.target.value)}
                                    disabled={saving}
                                />
                            </div>

                            <div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-[var(--muted-foreground)] mb-1">IVA</label>
                                        <input
                                            className="w-full p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm text-[var(--foreground)]"
                                            placeholder="0.13 ó 13"
                                            value={iva}
                                            onChange={(e) => setIva(e.target.value)}
                                            disabled={saving}
                                            inputMode="decimal"
                                        />
                                        <div className="text-xs text-[var(--muted-foreground)] mt-1">0.13 = 13% (también acepta 13)</div>
                                    </div>

                                    <div>
                                        <label className="block text-xs text-[var(--muted-foreground)] mb-1">Margen</label>
                                        <input
                                            className="w-full p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm text-[var(--foreground)]"
                                            placeholder="0.35 ó 35"
                                            value={margen}
                                            onChange={(e) => setMargen(e.target.value)}
                                            disabled={saving}
                                            inputMode="decimal"
                                        />
                                        <div className="text-xs text-[var(--muted-foreground)] mt-1">0.35 = 35% (también acepta 35)</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <IngredientesEditorToReceip
                        ingredientes={ingredientes}
                        saving={saving}
                        activeIngredientIndex={activeIngredientIndex}
                        setActiveIngredientIndex={setActiveIngredientIndex}
                        setProductoSearchTerm={setProductoSearchTerm}
                        productoResults={productoResults}
                        productoSearching={productoSearching}
                        productoSearchError={productoSearchError}
                        onAddIngredient={addIngredientRow}
                        onRemoveIngredientByRowId={removeIngredientRowByRowId}
                        onUpdateIngredient={updateIngredient}
                    />
                </div>
            </RightDrawer>

            <div className="mt-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2 sm:mb-3">
                    <h3 className="text-xs sm:text-sm font-semibold text-[var(--foreground)] leading-tight">
                        Lista de recetas
                        <span className="ml-2 text-xs font-medium text-[var(--muted-foreground)]">({filteredRecetas.length})</span>
                    </h3>

                    <Paginacion
                        totalItems={filteredRecetas.length}
                        itemsPerPage={itemsPerPage}
                        setItemsPerPage={setItemsPerPage}
                        currentPage={currentPage}
                        totalPages={totalPages}
                        setCurrentPage={setCurrentPage}
                        disabled={isLoading}
                    />
                </div>

                <RecetasListContent
                    isLoading={isLoading}
                    filteredCount={filteredRecetas.length}
                    searchTerm={searchTerm}
                    recetas={paginatedRecetas}
                    productosById={productosById}
                    saving={saving}
                    deletingId={deletingId}
                    onEdit={openEditDrawer}
                    onRemove={openRemoveModal}
                />
            </div>

            <ConfirmModal
                open={confirmState.open}
                title="Eliminar receta"
                message={`Quieres eliminar la receta "${confirmState.nombre}"? Esta acción no se puede deshacer.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                actionType="delete"
                loading={deletingId !== null && deletingId === confirmState.id}
                onConfirm={confirmRemoveReceta}
                onCancel={closeRemoveModal}
            />
        </div>
    );
}
