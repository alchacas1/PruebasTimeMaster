"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { EmpresasService } from '@/services/empresas';
import { SolicitudesService } from '@/services/solicitudes';
import type { Empresas } from '@/types/firestore';
import useToast from '@/hooks/useToast';

export default function SolicitudForm() {
    const { showToast } = useToast();
    const [productName, setProductName] = useState('');
    const [empresas, setEmpresas] = useState<Empresas[]>([]);
    const [empresaSelected, setEmpresaSelected] = useState('');
    // filtro para la lista de solicitudes ('' = todas)
    const [empresaFilter, setEmpresaFilter] = useState('');
    const [searchText, setSearchText] = useState('');
    const [showListosOnly, setShowListosOnly] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const messageTimer = useRef<number | null>(null);

    // Helper to show a temporary message for 2 seconds
    const showTempMessage = (msg: { type: 'success' | 'error'; text: string }) => {
        setMessage(msg);
        if (messageTimer.current) {
            window.clearTimeout(messageTimer.current);
        }
        // store timer id so we can clear it if needed
        messageTimer.current = window.setTimeout(() => {
            setMessage(null);
            messageTimer.current = null;
        }, 2000) as unknown as number;
    };

    // Clear timer on unmount
    useEffect(() => {
        return () => {
            if (messageTimer.current) window.clearTimeout(messageTimer.current);
        };
    }, []);

    // Lista de solicitudes
    const [solicitudes, setSolicitudes] = useState<any[]>([]);
    const [loadingList, setLoadingList] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [toDelete, setToDelete] = useState<{ id: string; productName?: string } | null>(null);
    const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const list = await EmpresasService.getAllEmpresas();
                setEmpresas(list || []);
                // default de empresa para envío (no para el filtro)
                if (list && list.length > 0) setEmpresaSelected(list[0].name || '');
            } catch (err) {
                console.error('Error loading empresas for solicitud:', err);
                setEmpresas([]);
            }
        };
        load();
    }, []);

    // Cargamos todas las solicitudes; el filtro de empresa es visual (client-side).
    const loadSolicitudes = useCallback(async () => {
        setLoadingList(true);
        try {
            const rows = await SolicitudesService.getAllSolicitudes();
            setSolicitudes(rows || []);
        } catch (err) {
            console.error('Error loading solicitudes:', err);
            setSolicitudes([]);
        } finally {
            setLoadingList(false);
        }
    }, []);

    // recargar inicialmente y cuando cambie la referencia de loadSolicitudes
    useEffect(() => {
        loadSolicitudes();
    }, [loadSolicitudes]);

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!productName.trim() || !empresaSelected) {
            setMessage({ type: 'error', text: 'Completa el nombre del producto y selecciona la empresa.' });
            return;
        }

        setSaving(true);
        setMessage(null);
        try {
            await SolicitudesService.addSolicitud({ productName: productName.trim(), empresa: empresaSelected });
            showTempMessage({ type: 'success', text: 'Solicitud enviada correctamente.' });
            setProductName('');
            await loadSolicitudes();
        } catch (err) {
            console.error('Error saving solicitud:', err);
            setMessage({ type: 'error', text: 'Error al enviar la solicitud.' });
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteClick = (id: string, productName?: string) => {
        setToDelete({ id, productName });
        setConfirmOpen(true);
    };

    const confirmDelete = async () => {
        if (!toDelete) return;
        const deletingId = toDelete.id;
        const previous = solicitudes;
        // Optimistic remove + close modal
        setConfirmOpen(false);
        setToDelete(null);
        setSolicitudes(prev => prev.filter(s => s.id !== deletingId));
        try {
            await SolicitudesService.deleteSolicitud(deletingId);
            showToast('Solicitud eliminada correctamente.', 'success');
        } catch (err) {
            console.error('Error deleting solicitud:', err);
            // rollback
            setSolicitudes(previous);
            showToast('Error al eliminar la solicitud.', 'error');
        }
    };

    const visibleSolicitudes = (solicitudes || []).filter((s: any) => {
        if (empresaFilter && (s?.empresa || '') !== empresaFilter) return false;
        if (showListosOnly && !Boolean(s?.listo)) return false;

        const q = searchText.trim().toLowerCase();
        if (!q) return true;

        const product = String(s?.productName || '').toLowerCase();
        const empresa = String(s?.empresa || '').toLowerCase();
        return product.includes(q) || empresa.includes(q);
    });

    const listosForSelectedEmpresa = (solicitudes || []).filter((s: any) => {
        if (!Boolean(s?.listo)) return false;
        if (!empresaFilter) return false;
        return (s?.empresa || '') === empresaFilter;
    });

    const confirmBulkDeleteListos = () => {
        if (!empresaFilter) {
            showToast('Selecciona una empresa para eliminar sus listos.', 'warning');
            return;
        }
        if (listosForSelectedEmpresa.length === 0) {
            showToast('No hay solicitudes listos para eliminar en esta empresa.', 'info');
            return;
        }
        setBulkConfirmOpen(true);
    };

    const runBulkDeleteListos = async () => {
        if (!empresaFilter) return;
        const ids = listosForSelectedEmpresa.map((s: any) => s.id).filter(Boolean);
        if (ids.length === 0) return;

        const previous = solicitudes;
        setBulkDeleting(true);
        // Optimistic remove + close modal
        setBulkConfirmOpen(false);
        setSolicitudes(prev => prev.filter(s => !ids.includes(s.id)));
        try {
            await SolicitudesService.deleteSolicitudesByIds(ids);
            showToast(`Eliminados ${ids.length} listos de ${empresaFilter}.`, 'success');
        } catch (err) {
            console.error('Error bulk deleting solicitudes:', err);
            // rollback
            setSolicitudes(previous);
            showToast('Error al eliminar los listos.', 'error');
        } finally {
            setBulkDeleting(false);
        }
    };

    const toggleListo = async (id: string, checked: boolean) => {
        // Optimistic update
        setSolicitudes(prev => prev.map(s => s.id === id ? { ...s, listo: checked } : s));
        try {
            await SolicitudesService.setListo(id, checked);
            showToast(checked ? 'Marcado como listo.' : 'Marcado como no listo.', 'success');
        } catch (err) {
            console.error('Error updating listo flag:', err);
            // revert optimistic
            setSolicitudes(prev => prev.map(s => s.id === id ? { ...s, listo: !checked } : s));
            showToast('Error al actualizar el estado.', 'error');
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-4 sm:p-6">
            <h1 className="text-xl sm:text-2xl font-bold mb-4">Nueva Solicitud</h1>

            {message && (
                <div className={`p-3 mb-4 rounded ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                    {message.text}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 bg-[var(--card-bg)] border border-[var(--input-border)] rounded p-3 sm:p-4">
                <div>
                    <label className="block text-sm font-medium mb-1">Nombre de producto</label>
                    <input
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        className="w-full p-2 sm:p-2 text-sm sm:text-base border border-[var(--border)] rounded bg-[var(--input-bg)]"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Empresa</label>
                    <select
                        value={empresaSelected}
                        onChange={(e) => setEmpresaSelected(e.target.value)}
                        className="w-full p-2 sm:p-2 text-sm sm:text-base border border-[var(--border)] rounded bg-[var(--input-bg)]"
                    >
                        <option value="">-- Seleccionar Empresa --</option>
                        {empresas.map((emp) => (
                            <option key={emp.id || emp.name} value={emp.name}>{emp.name}</option>
                        ))}
                    </select>
                </div>



                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full sm:w-auto px-4 py-2 bg-[var(--primary)] text-white rounded hover:bg-[var(--button-hover)] disabled:opacity-50"
                    >
                        {saving ? 'Enviando...' : 'Guardar'}
                    </button>
                </div>
            </form>

            {/* Lista de solicitudes guardadas */}
            <div className="mt-6">
                <div className="mb-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
                    <label className="text-sm font-medium whitespace-nowrap">Filtrar por empresa:</label>
                    <select
                        value={empresaFilter}
                        onChange={(e) => setEmpresaFilter(e.target.value)}
                        className="w-full sm:w-auto sm:min-w-56 p-2 text-sm sm:text-base border border-[var(--border)] rounded bg-[var(--input-bg)]"
                    >
                        <option value="">-- Todas las empresas --</option>
                        {empresas.map((emp) => (
                            <option key={emp.id || emp.name} value={emp.name}>{emp.name}</option>
                        ))}
                    </select>

                    <div className="w-full sm:flex-1 sm:min-w-64">
                        <label className="sr-only">Buscar</label>
                        <input
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            placeholder="Buscar (producto o empresa)"
                            className="w-full p-2 text-sm sm:text-base border border-[var(--border)] rounded bg-[var(--input-bg)]"
                        />
                    </div>

                    <label className="inline-flex items-center gap-2">
                        <input
                            type="checkbox"
                            className="form-checkbox h-4 w-4"
                            checked={showListosOnly}
                            onChange={(e) => setShowListosOnly(e.target.checked)}
                        />
                        <span className="text-sm text-[var(--muted-foreground)]">Solo listos</span>
                    </label>

                    {showListosOnly && (
                        <button
                            type="button"
                            onClick={confirmBulkDeleteListos}
                            disabled={bulkDeleting || !empresaFilter || listosForSelectedEmpresa.length === 0}
                            className="w-full sm:w-auto sm:ml-auto px-3 py-2 bg-red-700 text-white rounded text-sm hover:bg-red-800 disabled:opacity-50"
                            title={!empresaFilter ? 'Selecciona una empresa para borrar sus listos' : undefined}
                        >
                            {bulkDeleting
                                ? 'Eliminando...'
                                : `Eliminar listos (${listosForSelectedEmpresa.length})`}
                        </button>
                    )}
                </div>
                <h2 className="text-base sm:text-lg font-semibold mb-3">Solicitudes guardadas</h2>
                {loadingList ? (
                    <div className="p-4 bg-[var(--card-bg)] border border-[var(--input-border)] rounded">Cargando...</div>
                ) : visibleSolicitudes.length === 0 ? (
                    <div className="p-4 bg-[var(--card-bg)] border border-[var(--input-border)] rounded">No hay solicitudes</div>
                ) : (
                    <>
                        {/* Desktop table view */}
                        <div className="hidden sm:block bg-[var(--card-bg)] border border-[var(--input-border)] rounded overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-[var(--muted)] text-left">
                                    <tr>
                                        <th className="px-4 py-2">Fecha</th>
                                        <th className="px-4 py-2">Producto</th>
                                        <th className="px-4 py-2">Empresa</th>
                                        <th className="px-4 py-2">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleSolicitudes.map((s) => (
                                        <tr key={s.id} className="border-t border-[var(--input-border)]">
                                            <td className="px-4 py-2 align-top">{s.createdAt ? new Date(s.createdAt.seconds ? s.createdAt.seconds * 1000 : s.createdAt).toLocaleString() : '-'}</td>
                                            <td className="px-4 py-2 align-top">{s.productName}</td>
                                            <td className="px-4 py-2 align-top">{s.empresa}</td>
                                            <td className="px-4 py-2 align-top">
                                                <label className="inline-flex items-center gap-2 mr-2">
                                                    <input type="checkbox" className="form-checkbox h-4 w-4" checked={Boolean(s.listo)} onChange={(e) => toggleListo(s.id, e.target.checked)} />
                                                    <span className="text-sm text-[var(--muted-foreground)]">Listo</span>
                                                </label>
                                                <button
                                                    onClick={() => handleDeleteClick(s.id, s.productName)}
                                                    className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                                                >Eliminar</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile card view */}
                        <div className="sm:hidden space-y-3">
                            {visibleSolicitudes.map((s) => (
                                <div key={s.id} className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded p-3">
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-start">
                                            <span className="text-xs text-[var(--muted-foreground)]">
                                                {s.createdAt ? new Date(s.createdAt.seconds ? s.createdAt.seconds * 1000 : s.createdAt).toLocaleString() : '-'}
                                            </span>
                                        </div>
                                        <div>
                                            <div className="text-xs text-[var(--muted-foreground)] mb-1">Producto</div>
                                            <div className="font-medium">{s.productName}</div>
                                        </div>
                                        <div>
                                            <div className="text-xs text-[var(--muted-foreground)] mb-1">Empresa</div>
                                            <div className="text-sm">{s.empresa}</div>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-[var(--input-border)]">
                                            <label className="flex items-center gap-2 flex-1">
                                                <input
                                                    type="checkbox"
                                                    className="form-checkbox h-4 w-4"
                                                    checked={Boolean(s.listo)}
                                                    onChange={(e) => toggleListo(s.id, e.target.checked)}
                                                />
                                                <span className="text-sm text-[var(--muted-foreground)]">Marcar como listo</span>
                                            </label>
                                            <button
                                                onClick={() => handleDeleteClick(s.id, s.productName)}
                                                className="px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 w-full sm:w-auto"
                                            >Eliminar</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Modal de confirmación de borrado */}
            {confirmOpen && toDelete && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded p-4 sm:p-6 max-w-sm w-full mx-4">
                        <h3 className="text-base sm:text-lg font-semibold mb-2">Confirmar eliminación</h3>
                        <p className="text-sm text-[var(--muted-foreground)] mb-4">¿Deseas eliminar la solicitud &quot;{toDelete.productName || ''}&quot;?</p>
                        <div className="flex flex-col sm:flex-row justify-end gap-2">
                            <button onClick={() => { setConfirmOpen(false); setToDelete(null); }} className="px-3 py-2 bg-gray-200 rounded w-full sm:w-auto order-2 sm:order-1">Cancelar</button>
                            <button onClick={confirmDelete} className="px-3 py-2 bg-red-600 text-white rounded w-full sm:w-auto order-1 sm:order-2">Eliminar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de confirmación de borrado masivo (listos) */}
            {bulkConfirmOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded p-4 sm:p-6 max-w-sm w-full mx-4">
                        <h3 className="text-base sm:text-lg font-semibold mb-2">Confirmar eliminación masiva</h3>
                        <p className="text-sm text-[var(--muted-foreground)] mb-4">
                            ¿Deseas eliminar {listosForSelectedEmpresa.length} solicitudes marcadas como listo de la empresa &quot;{empresaFilter}&quot;?
                        </p>
                        <div className="flex flex-col sm:flex-row justify-end gap-2">
                            <button
                                onClick={() => setBulkConfirmOpen(false)}
                                disabled={bulkDeleting}
                                className="px-3 py-2 bg-gray-200 rounded w-full sm:w-auto order-2 sm:order-1 disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={runBulkDeleteListos}
                                disabled={bulkDeleting}
                                className="px-3 py-2 bg-red-700 text-white rounded w-full sm:w-auto order-1 sm:order-2 hover:bg-red-800 disabled:opacity-50"
                            >
                                {bulkDeleting ? 'Eliminando...' : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
