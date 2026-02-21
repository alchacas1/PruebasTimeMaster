"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
    Lock,
    PackagePlus,
    Pencil,
    Trash2,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getDefaultPermissions } from "@/utils/permissions";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useProductos } from "@/hooks/useProductos";
import useToast from "@/hooks/useToast";
import type { ProductEntry } from "@/types/firestore";
import { useActorOwnership } from "@/hooks/useActorOwnership";
import { EmpresaSearchAddSection } from "@/components/recetas/component/EmpresaSearchAddSection";

const sanitizeNumber = (value: string): number => {
    const trimmed = String(value || "").trim().replace(/,/g, ".");
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatNumber = (value: number, maxDecimals = 4, minDecimals = 0): string => {
    if (!Number.isFinite(value)) return "0";
    return new Intl.NumberFormat("es-CR", {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
    }).format(value);
};

const computePrecioXGramo = (precio: number, pesoengramos: number): number => {
    if (!Number.isFinite(precio) || !Number.isFinite(pesoengramos)) return 0;
    if (pesoengramos <= 0) return 0;
    return precio / pesoengramos;
};

export function AgregarProductoTab() {
    const { user, loading: authLoading } = useAuth();
    const { ownerIds: actorOwnerIds } = useActorOwnership(user || {});
    const permissions =
        user?.permissions || getDefaultPermissions(user?.role || "user");
    const canAgregarProductos = Boolean(permissions.agregarproductosdeli);
    const isAdminLike = user?.role === "admin" || user?.role === "superadmin";

    const { showToast } = useToast();

    const [empresaError, setEmpresaError] = useState<string | null>(null);
    const [selectedEmpresa, setSelectedEmpresa] = useState<string>("");

    const companyFromUser = String(user?.ownercompanie || "").trim();

    const {
        productos,
        loading: productosLoading,
        error,
        addProducto,
        updateProducto,
        removeProducto,
    } = useProductos({ companyOverride: isAdminLike ? selectedEmpresa : undefined });


    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState<number | "all">(10);

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingProductId, setEditingProductId] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [nombre, setNombre] = useState("");
    const [descripcion, setDescripcion] = useState("");
    const [pesoEnGramos, setPesoEnGramos] = useState("");
    const [precio, setPrecio] = useState("");

    const [touched, setTouched] = useState({
        nombre: false,
        peso: false,
        precio: false,
    });
    const [lastSaveFeedback, setLastSaveFeedback] = useState<null | {
        type: "add" | "edit";
        nombre: string;
    }>(null);

    const [confirmState, setConfirmState] = useState<{
        open: boolean;
        id: string;
        nombre: string;
    }>({ open: false, id: "", nombre: "" });

    const [saveConfirmState, setSaveConfirmState] = useState<null | {
        mode: "add" | "edit";
        productId?: string;
        input: {
            nombre: string;
            descripcion?: string;
            pesoengramos: number;
            precio: number;
        };
    }>(null);

    const isLoading = authLoading || productosLoading;
    const resolvedError = formError || error || empresaError;

    const filteredProductos = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return productos;
        return productos.filter((p) => {
            const n = (p.nombre || "").toLowerCase();
            const d = (p.descripcion || "").toLowerCase();
            const i = (p.id || "").toLowerCase();
            return n.includes(term) || d.includes(term) || i.includes(term);
        });
    }, [productos, searchTerm]);

    const totalPages = useMemo(() => {
        if (itemsPerPage === "all") return 1;
        return Math.max(1, Math.ceil(filteredProductos.length / itemsPerPage));
    }, [filteredProductos.length, itemsPerPage]);

    const paginatedProductos = useMemo(() => {
        if (itemsPerPage === "all") return filteredProductos;
        const start = (currentPage - 1) * itemsPerPage;
        return filteredProductos.slice(start, start + itemsPerPage);
    }, [filteredProductos, currentPage, itemsPerPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, itemsPerPage]);

    const resetForm = () => {
        setFormError(null);
        setNombre("");
        setDescripcion("");
        setPesoEnGramos("");
        setPrecio("");
        setEditingProductId(null);
        setTouched({ nombre: false, peso: false, precio: false });
    };

    const openAddDrawer = () => {
        resetForm();
        setDrawerOpen(true);
    };

    const openEditDrawer = (p: ProductEntry) => {
        setFormError(null);
        setEditingProductId(p.id);
        setNombre(p.nombre || "");
        setDescripcion(p.descripcion || "");
        setPesoEnGramos(String(p.pesoengramos ?? ""));
        setPrecio(String(p.precio ?? ""));
        setDrawerOpen(true);
    };

    const closeDrawer = () => {
        setDrawerOpen(false);
        resetForm();
    };

    const openRemoveModal = (p: ProductEntry) => {
        setConfirmState({ open: true, id: p.id, nombre: p.nombre || p.id });
    };

    const closeRemoveModal = () =>
        setConfirmState({ open: false, id: "", nombre: "" });

    const closeSaveConfirmModal = () => setSaveConfirmState(null);

    const confirmRemoveProducto = async () => {
        if (!confirmState.id || deletingId) return;
        try {
            setFormError(null);
            setDeletingId(confirmState.id);
            await removeProducto(confirmState.id);
            showToast("Producto eliminado.", "success");
            closeRemoveModal();
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "No se pudo eliminar el producto.";
            setFormError(message);
            showToast(message, "error");
        } finally {
            setDeletingId(null);
        }
    };

    const requestSaveConfirm = () => {
        const nombreTrim = nombre.trim();
        if (!nombreTrim) {
            setFormError("Nombre requerido.");
            return;
        }
        const pesoVal = sanitizeNumber(pesoEnGramos);
        const precioVal = sanitizeNumber(precio);
        if (pesoVal <= 0) {
            setFormError("El peso en gramos debe ser mayor a 0.");
            return;
        }
        if (precioVal <= 0) {
            setFormError("El precio debe ser mayor a 0.");
            return;
        }
        if (productosLoading) {
            setFormError("Espera a que carguen los productos.");
            return;
        }

        setFormError(null);
        setSaveConfirmState({
            mode: editingProductId ? "edit" : "add",
            productId: editingProductId ?? undefined,
            input: {
                nombre: nombreTrim,
                descripcion: descripcion.trim() || undefined,
                pesoengramos: pesoVal,
                precio: precioVal,
            },
        });
    };

    const confirmSaveProducto = async () => {
        if (!saveConfirmState) return;
        try {
            setSaving(true);
            setFormError(null);

            if (saveConfirmState.mode === "edit" && saveConfirmState.productId) {
                await updateProducto(saveConfirmState.productId, saveConfirmState.input);
                showToast("Producto actualizado.", "success");
                setLastSaveFeedback({ type: "edit", nombre: saveConfirmState.input.nombre });
            } else {
                await addProducto(saveConfirmState.input);
                showToast("Producto agregado.", "success");
                setLastSaveFeedback({ type: "add", nombre: saveConfirmState.input.nombre });
            }

            closeSaveConfirmModal();
            setDrawerOpen(false);
            resetForm();
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "No se pudo guardar el producto.";
            setFormError(message);
            showToast(message, "error");
            // Cerrar el modal para permitir corregir el formulario.
            closeSaveConfirmModal();
        } finally {
            setSaving(false);
        }
    };

    const precioNum = sanitizeNumber(precio);
    const pesoNum = sanitizeNumber(pesoEnGramos);
    const precioXGramo = computePrecioXGramo(precioNum, pesoNum);

    const nombreError = useMemo(() => {
        return nombre.trim().length > 0 ? null : "Nombre requerido.";
    }, [nombre]);

    const pesoError = useMemo(() => {
        const raw = String(pesoEnGramos || "").trim();
        if (!raw) return "Peso requerido.";
        const val = sanitizeNumber(raw);
        return val > 0 ? null : "El peso debe ser mayor a 0.";
    }, [pesoEnGramos]);

    const precioError = useMemo(() => {
        const raw = String(precio || "").trim();
        if (!raw) return "Precio requerido.";
        const val = sanitizeNumber(raw);
        return val > 0 ? null : "El precio debe ser mayor a 0.";
    }, [precio]);

    const isFormValid = useMemo(() => {
        return !nombreError && !pesoError && !precioError;
    }, [nombreError, pesoError, precioError]);

    if (authLoading) {
        return (
            <div className="max-w-4xl mx-auto bg-[var(--card-bg)] border border-[var(--input-border)] rounded-lg shadow p-6">
                <p className="text-sm text-[var(--muted-foreground)] text-center">
                    Cargando permisos...
                </p>
            </div>
        );
    }

    if (!canAgregarProductos) {
        return (
            <div className="max-w-4xl mx-auto bg-[var(--card-bg)] border border-[var(--input-border)] rounded-lg shadow p-6">
                <div className="flex flex-col items-center text-center py-8">
                    <Lock className="w-10 h-10 text-[var(--muted-foreground)] mb-4" />
                    <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
                        Acceso restringido
                    </h3>
                    <p className="text-[var(--muted-foreground)]">
                        Tu usuario no tiene permisos para agregar productos.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto bg-[var(--card-bg)] border border-[var(--input-border)] rounded-lg shadow p-4 sm:p-6">
            <ConfirmModal
                open={saveConfirmState !== null}
                title={saveConfirmState?.mode === "edit" ? "Confirmar actualización" : "Confirmar guardado"}
                message={
                    saveConfirmState?.mode === "edit"
                        ? `Quieres actualizar el producto "${saveConfirmState?.input.nombre}"?`
                        : `Quieres guardar el producto "${saveConfirmState?.input.nombre}"?`
                }
                confirmText={saveConfirmState?.mode === "edit" ? "Actualizar" : "Guardar"}
                cancelText="Cancelar"
                actionType={saveConfirmState?.mode === "edit" ? "change" : "assign"}
                loading={saving}
                onConfirm={confirmSaveProducto}
                onCancel={closeSaveConfirmModal}
            />
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <PackagePlus className="w-5 h-5 text-[var(--muted-foreground)]" />
                    <div>
                        <h2 className="text-sm sm:text-base font-medium text-[var(--muted-foreground)]">
                            Productos
                        </h2>
                        <p className="text-[10px] sm:text-xs text-[var(--muted-foreground)]">
                            Administra productos para tu empresa.
                        </p>
                    </div>
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
                    searchPlaceholder={productosLoading ? "Cargando..." : "Buscar producto"}
                    searchAriaLabel="Buscar producto"
                    addButtonText="Agregar producto"
                    onAddClick={openAddDrawer}
                    addDisabled={saving || productosLoading}
                />
            </div>

            {resolvedError && (
                <div className="mb-4 text-sm text-red-500">{resolvedError}</div>
            )}

            <div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2 sm:mb-3">
                    <h3 className="text-xs sm:text-sm font-semibold text-[var(--foreground)] leading-tight">
                        Lista de productos
                        <span className="ml-2 text-xs font-medium text-[var(--muted-foreground)]">
                            ({filteredProductos.length})
                        </span>
                    </h3>
                    {filteredProductos.length > 0 && (
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
                                        disabled={currentPage <= 1}
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
                                        disabled={currentPage >= totalPages}
                                        onClick={() =>
                                            setCurrentPage((p) => Math.min(totalPages, p + 1))
                                        }
                                        aria-label="Página siguiente"
                                        title="Siguiente"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {isLoading ? (
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
                ) : (
                    <ul className="space-y-1.5 sm:space-y-2">
                        {filteredProductos.length === 0 && (
                            <li className="border border-[var(--input-border)] rounded-lg bg-[var(--input-bg)] p-6 text-center">
                                <div className="text-sm font-semibold text-[var(--foreground)]">
                                    {searchTerm ? "Sin resultados" : "Aún no hay productos"}
                                </div>
                                <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                                    {searchTerm
                                        ? "Prueba con otro nombre o descripción."
                                        : "Agrega tu primer producto para empezar."}
                                </div>
                            </li>
                        )}

                        {paginatedProductos.map((p) => (
                            <li
                                key={p.id}
                                className="group flex flex-col sm:flex-row sm:items-stretch border border-[var(--input-border)] rounded-lg overflow-hidden bg-[var(--input-bg)] transition-colors duration-150 hover:bg-[var(--muted)] focus-within:ring-2 focus-within:ring-[var(--accent)]/40"
                            >
                                <div className="flex-1 p-4 sm:p-5 min-w-0">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-sm sm:text-base font-semibold text-[var(--foreground)] truncate">
                                                {p.nombre}
                                            </div>
                                            {p.descripcion && (
                                                <div className="mt-2 text-xs text-[var(--muted-foreground)] opacity-70 break-words">
                                                    {p.descripcion}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-sm sm:text-base font-semibold text-[var(--foreground)] whitespace-nowrap">
                                                ₡ {formatNumber(p.precio, 2)}
                                            </div>
                                            <div className="mt-1 text-[10px] sm:text-xs text-[var(--muted-foreground)] whitespace-nowrap">
                                                {formatNumber(p.pesoengramos, 0)} g • ₡ {formatNumber(p.precioxgramo, 2, 2)}/g
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 px-2.5 py-2 sm:px-3 sm:py-3 border-t sm:border-t-0 sm:border-l border-[var(--input-border)] bg-black/10 transition-colors duration-150 group-hover:bg-black/20">
                                    <button
                                        type="button"
                                        className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50 p-2.5 rounded-md hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 transition-colors"
                                        onClick={() => openEditDrawer(p)}
                                        disabled={saving || deletingId !== null}
                                        title="Editar producto"
                                        aria-label="Editar producto"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>

                                    <div className="w-px h-7 bg-[var(--input-border)]" />

                                    <button
                                        type="button"
                                        className="text-red-400 hover:text-red-300 disabled:opacity-50 p-2.5 rounded-md hover:bg-red-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 transition-colors"
                                        onClick={() => openRemoveModal(p)}
                                        disabled={saving || deletingId !== null}
                                        title="Eliminar producto"
                                        aria-label="Eliminar producto"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <ConfirmModal
                open={confirmState.open}
                title="Eliminar producto"
                message={`Quieres eliminar el producto "${confirmState.nombre}"? Esta acción no se puede deshacer.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                actionType="delete"
                loading={deletingId !== null && deletingId === confirmState.id}
                onConfirm={confirmRemoveProducto}
                onCancel={closeRemoveModal}
            />

            <RightDrawer
                open={drawerOpen}
                onClose={closeDrawer}
                title={editingProductId ? "Editar producto" : "Agregar producto"}
                footer={
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={closeDrawer}
                            className="px-4 py-2 border border-[var(--input-border)] rounded text-[var(--foreground)] hover:bg-[var(--muted)] bg-transparent"
                            disabled={saving}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={async () => {
                                setTouched({ nombre: true, peso: true, precio: true });
                                if (!isFormValid) {
                                    setFormError("Revisa los campos marcados.");
                                    return;
                                }
                                requestSaveConfirm();
                            }}
                            className="px-4 py-2 bg-[var(--accent)] text-white rounded disabled:opacity-50"
                            disabled={saving || deletingId !== null || !isFormValid}
                        >
                            {saving
                                ? editingProductId
                                    ? "Actualizando..."
                                    : "Guardando..."
                                : editingProductId
                                    ? "Actualizar"
                                    : "Guardar producto"}
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
                                <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                                    Nombre
                                </label>
                                <input
                                    className="w-full p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm text-[var(--foreground)]"
                                    placeholder="Ej: Arroz 1kg"
                                    value={nombre}
                                    onChange={(e) => {
                                        setNombre(e.target.value);
                                        setLastSaveFeedback(null);
                                    }}
                                    onBlur={() => setTouched((t) => ({ ...t, nombre: true }))}
                                    disabled={saving || deletingId !== null}
                                    autoFocus
                                />
                                {(touched.nombre || formError) && nombreError && (
                                    <div className="mt-1 text-xs text-red-400">{nombreError}</div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                                    Descripción (opcional)
                                </label>
                                <textarea
                                    className="w-full p-3 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm text-[var(--foreground)] min-h-[90px]"
                                    placeholder="Ej: Marca, presentación, notas..."
                                    value={descripcion}
                                    onChange={(e) => setDescripcion(e.target.value)}
                                    disabled={saving || deletingId !== null}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">
                            Precio y peso
                        </div>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                                    Peso
                                </label>
                                <div className="flex items-stretch rounded border border-[var(--input-border)] bg-[var(--input-bg)] overflow-hidden">
                                    <input
                                        className="flex-1 p-3 bg-transparent text-sm text-[var(--foreground)] focus:outline-none"
                                        placeholder="Ej: 1000"
                                        inputMode="decimal"
                                        value={pesoEnGramos}
                                        onChange={(e) => {
                                            setPesoEnGramos(e.target.value);
                                            setLastSaveFeedback(null);
                                        }}
                                        onBlur={() => setTouched((t) => ({ ...t, peso: true }))}
                                        disabled={saving || deletingId !== null}
                                    />
                                    <div className="px-3 grid place-items-center text-xs text-[var(--muted-foreground)] border-l border-[var(--input-border)]">
                                        grms
                                    </div>
                                </div>
                                {(touched.peso || formError) && pesoError && (
                                    <div className="mt-1 text-xs text-red-400">{pesoError}</div>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs text-[var(--muted-foreground)] mb-1">
                                    Precio
                                </label>
                                <div className="flex items-stretch rounded border border-[var(--input-border)] bg-[var(--input-bg)] overflow-hidden">
                                    <div className="px-3 grid place-items-center text-xs text-[var(--muted-foreground)] border-r border-[var(--input-border)]">
                                        ₡
                                    </div>
                                    <input
                                        className="flex-1 p-3 bg-transparent text-sm text-[var(--foreground)] focus:outline-none"
                                        placeholder="Ej: 1500"
                                        inputMode="decimal"
                                        value={precio}
                                        onChange={(e) => {
                                            setPrecio(e.target.value);
                                            setLastSaveFeedback(null);
                                        }}
                                        onBlur={() => setTouched((t) => ({ ...t, precio: true }))}
                                        disabled={saving || deletingId !== null}
                                    />
                                </div>
                                {(touched.precio || formError) && precioError && (
                                    <div className="mt-1 text-xs text-red-400">{precioError}</div>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 rounded border border-[var(--input-border)] p-3 bg-[var(--input-bg)]">
                            <div className="text-xs text-[var(--muted-foreground)]">Precio por gramo (solo lectura)</div>
                            <div className="text-sm font-semibold text-[var(--foreground)]">
                                ₡ {formatNumber(precioXGramo, 2, 2)} / g
                            </div>
                        </div>
                    </div>
                </div>
            </RightDrawer>
        </div>
    );
}
