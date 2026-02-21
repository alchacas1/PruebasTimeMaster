'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Users, Lock as LockIcon, Building2, Search, Pencil } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useActorOwnership } from '../../hooks/useActorOwnership';
import { hasPermission } from '../../utils/permissions';
import { EmpresasService } from '../../services/empresas';
import { EmpleadosService } from '../../services/empleados';
import EmpleadoDetailsModal from '../ui/EmpleadoDetailsModal';
import type { Empresas, EmpresaEmpleado, Empleado } from '../../types/firestore';

type EmpresaOption = {
  key: string;
  label: string;
};

type MergedEmpleadoEntry = {
  key: string; // normalized name key
  name: string;
  doc?: Empleado;
  embedded?: EmpresaEmpleado;
};

function normalizeStr(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function formatLocalISODate(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy}`;
}
function formatYMDToDMY(value: string): string {
  const s = String(value || '').trim();
  // Esperado: YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s; // si viene en otro formato, lo mostramos tal cual
  const [, yyyy, mm, dd] = m;
  return `${dd}/${mm}/${yyyy}`;
}
function getDisplayedIngresoDate(e: Partial<Empleado> | undefined): string {
  const useDynamicIngresoDate = !Boolean(e?.incluidoCCSS) && !Boolean(e?.incluidoINS);
  if (useDynamicIngresoDate) return formatLocalISODate();

  const dia = String(e?.diaContratacion || '').trim();
  if (!dia) return '—';
  return formatYMDToDMY(dia);
}

function getEmpresaKey(e: Partial<Empresas>) {
  const id = String(e.id ?? '').trim();
  const ubic = String(e.ubicacion ?? '').trim();
  const name = String(e.name ?? '').trim();
  return [id || 'no-id', ubic || name || 'no-name'].join('::');
}

function getEmpresaLabel(e: Partial<Empresas>) {
  const name = String(e.name ?? '').trim();
  const ubic = String(e.ubicacion ?? '').trim();
  if (name && ubic && normalizeStr(name) !== normalizeStr(ubic)) return `${name} (${ubic})`;
  return name || ubic || String(e.id ?? 'Empresa');
}

function matchEmpresaByCompanyKey(e: Partial<Empresas>, companyKey: string) {
  const key = normalizeStr(companyKey);
  if (!key) return false;
  const name = normalizeStr(e.name);
  const ubic = normalizeStr(e.ubicacion);
  return name === key || ubic === key || name.includes(key) || ubic.includes(key) || key.includes(name) || key.includes(ubic);
}

function sortEmpleados(list: EmpresaEmpleado[]) {
  return [...(list || [])]
    .filter((x) => String(x?.Empleado ?? '').trim().length > 0)
    .sort((a, b) => String(a.Empleado || '').localeCompare(String(b.Empleado || ''), 'es', { sensitivity: 'base' }));
}

function isEmpleadoDetailsComplete(e: Partial<Empleado>) {
  const pagoOk = typeof e.pagoHoraBruta === 'number' && Number.isFinite(e.pagoHoraBruta);
  const sinSeguros = !Boolean(e.incluidoCCSS) && !Boolean(e.incluidoINS);
  const diaOk = String(e.diaContratacion || '').trim().length > 0 || sinSeguros;
  const horasOk = typeof e.cantidadHorasTrabaja === 'number' && Number.isFinite(e.cantidadHorasTrabaja);
  const stringsOk = [
    e.paganAguinaldo,
    e.danReciboPago,
    e.contratoFisico,
    e.espacioComida,
    e.brindanVacaciones,
  ].every((v) => typeof v === 'string' && v.trim().length > 0);

  const boolsOk = [e.incluidoCCSS, e.incluidoINS].every((v) => typeof v === 'boolean');
  return pagoOk && diaOk && horasOk && stringsOk && boolsOk;
}

function mergeEmpleadosForEmpresa(empresaId: string, embedded: EmpresaEmpleado[], docs: Empleado[]): MergedEmpleadoEntry[] {
  const byKey = new Map<string, MergedEmpleadoEntry>();

  for (const emp of sortEmpleados(embedded || [])) {
    const name = String(emp?.Empleado ?? '').trim();
    if (!name) continue;
    const key = normalizeStr(name);
    if (!key) continue;
    byKey.set(key, {
      key,
      name,
      embedded: emp,
    });
  }

  for (const doc of docs || []) {
    const name = String(doc?.Empleado ?? '').trim();
    if (!name) continue;
    const key = normalizeStr(name);
    if (!key) continue;
    const prev = byKey.get(key);
    byKey.set(key, {
      key,
      name,
      embedded: prev?.embedded,
      doc: {
        ...doc,
        empresaId: String(doc.empresaId || empresaId).trim(),
      },
    });
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}

export default function EmpleadosProximamente() {
  const { user } = useAuth();
  const { ownerIds } = useActorOwnership(user || {});

  const [empresas, setEmpresas] = useState<Empresas[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedEmpresaKey, setSelectedEmpresaKey] = useState<string>('');
  const [search, setSearch] = useState('');

  const [empleadosByEmpresaId, setEmpleadosByEmpresaId] = useState<Record<string, Empleado[]>>({});
  const [empleadosLoading, setEmpleadosLoading] = useState(false);
  const [empleadosError, setEmpleadosError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalEmpleado, setModalEmpleado] = useState<Empleado | null>(null);
  const [modalReadOnly, setModalReadOnly] = useState(true);

  const canUse = hasPermission(user?.permissions, 'empleados');

  useEffect(() => {
    if (!canUse) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const all = await EmpresasService.getAllEmpresas();
        if (cancelled) return;
        setEmpresas(all || []);
      } catch (e) {
        console.error('Error loading empresas:', e);
        if (!cancelled) setError('No se pudieron cargar las empresas.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [canUse]);

  const role = user?.role || 'user';
  const isSuperAdmin = role === 'superadmin';
  const isAdmin = role === 'admin';
  const isUser = role === 'user';

  const allowedEmpresas = useMemo(() => {
    const all = empresas || [];
    if (!user) return [];

    if (isSuperAdmin) return all;

    const ownerIdSet = new Set((ownerIds || []).map((id) => String(id)));
    const companyKey = String(user.ownercompanie || '').trim();

    // Admin: show empresas owned by the actor. Fallback-match by ownercompanie if present.
    if (isAdmin) {
      return all.filter((e) => {
        if (!e) return false;
        const ownerMatch = e.ownerId && ownerIdSet.has(String(e.ownerId));
        const companyMatch = companyKey ? matchEmpresaByCompanyKey(e, companyKey) : false;
        return Boolean(ownerMatch || companyMatch);
      });
    }

    // User: show only the user's assigned company.
    if (isUser) {
      const byCompany = companyKey
        ? all.filter((e) => matchEmpresaByCompanyKey(e, companyKey))
        : [];
      if (byCompany.length > 0) return byCompany;

      // Fallback: if there's an ownerId relationship, use it.
      const fallbackOwnerId = String(user.ownerId || user.id || '').trim();
      if (fallbackOwnerId) {
        return all.filter((e) => String(e.ownerId || '') === fallbackOwnerId);
      }
      return [];
    }

    // Unknown roles -> safest: none
    return [];
  }, [empresas, isAdmin, isSuperAdmin, isUser, ownerIds, user]);

  const empresaOptions: EmpresaOption[] = useMemo(() => {
    return (allowedEmpresas || [])
      .map((e) => ({ key: getEmpresaKey(e), label: getEmpresaLabel(e) }))
      .filter((x) => x.key && x.label)
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
  }, [allowedEmpresas]);

  // Default selection for admin: assigned company if matches; else first available.
  useEffect(() => {
    if (!user) return;
    if (!isAdmin) return;
    if (!empresaOptions.length) return;

    setSelectedEmpresaKey((prev) => {
      if (prev) return prev;
      const assigned = String(user.ownercompanie || '').trim();
      if (assigned) {
        const match = allowedEmpresas.find((e) => matchEmpresaByCompanyKey(e, assigned));
        if (match) return getEmpresaKey(match);
      }
      return empresaOptions[0]!.key;
    });
  }, [allowedEmpresas, empresaOptions, isAdmin, user]);

  const effectiveSelectedEmpresaKey = isAdmin ? selectedEmpresaKey : '';

  const visibleEmpresas = useMemo(() => {
    if (isSuperAdmin) return allowedEmpresas;
    if (isAdmin) {
      if (!effectiveSelectedEmpresaKey) return [];
      return (allowedEmpresas || []).filter((e) => getEmpresaKey(e) === effectiveSelectedEmpresaKey);
    }
    // user
    return allowedEmpresas;
  }, [allowedEmpresas, effectiveSelectedEmpresaKey, isAdmin, isSuperAdmin]);

  // Load empleados docs from the new collection for the currently visible empresas
  useEffect(() => {
    if (!canUse) return;

    const empresaIds = (visibleEmpresas || [])
      .map((e) => String(e.id || '').trim())
      .filter((id) => id.length > 0);

    if (empresaIds.length === 0) return;

    let cancelled = false;
    const loadEmpleados = async () => {
      setEmpleadosLoading(true);
      setEmpleadosError(null);
      try {
        const pairs = await Promise.all(
          empresaIds.map(async (empresaId) => {
            const list = await EmpleadosService.getByEmpresaId(empresaId);
            return [empresaId, (list || []) as Empleado[]] as const;
          })
        );

        if (cancelled) return;
        setEmpleadosByEmpresaId((prev) => {
          const next = { ...prev };
          for (const [empresaId, list] of pairs) next[empresaId] = list;
          return next;
        });
      } catch (e) {
        console.error('Error loading empleados:', e);
        if (!cancelled) setEmpleadosError('No se pudieron cargar los empleados.');
      } finally {
        if (!cancelled) setEmpleadosLoading(false);
      }
    };

    loadEmpleados();
    return () => {
      cancelled = true;
    };
  }, [canUse, visibleEmpresas]);

  const searchNorm = normalizeStr(search);

  const openEmpleadoModal = (emp: Empleado, readOnly: boolean) => {
    setModalEmpleado(emp);
    setModalReadOnly(readOnly);
    setModalOpen(true);
  };

  const closeEmpleadoModal = () => {
    setModalOpen(false);
    setModalEmpleado(null);
  };

  const refreshEmpresaEmpleados = async (empresaId: string) => {
    const id = String(empresaId || '').trim();
    if (!id) return;
    // Use forceRefresh to bypass cache after updates
    const list = await EmpleadosService.getByEmpresaId(id, true);
    setEmpleadosByEmpresaId((prev) => ({ ...prev, [id]: (list || []) as Empleado[] }));
  };

  if (!canUse) {
    return (
      <div className="flex items-center justify-center p-8 bg-[var(--card-bg)] rounded-lg border border-[var(--input-border)]">
        <div className="text-center">
          <LockIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">Acceso Restringido</h3>
          <p className="text-[var(--muted-foreground)]">No tienes permisos para acceder a Empleados.</p>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">Contacta a un administrador para obtener acceso.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <EmpleadoDetailsModal
        isOpen={modalOpen}
        onClose={closeEmpleadoModal}
        empleado={modalEmpleado}
        readOnly={modalReadOnly}
        onSave={async (patch) => {
          if (!modalEmpleado) return;
          const empresaId = String(modalEmpleado.empresaId || '').trim();
          if (!empresaId) throw new Error('empresaId faltante');

          // If employee doc already exists, update; otherwise upsert by empresaId+name
          if (modalEmpleado.id) {
            await EmpleadosService.updateEmpleado(modalEmpleado.id, patch);
          } else {
            await EmpleadosService.upsertEmpleadoByEmpresaAndName({
              ...modalEmpleado,
              ...patch,
              empresaId,
              Empleado: String(modalEmpleado.Empleado || '').trim(),
              ccssType: patch.ccssType || modalEmpleado.ccssType || 'TC',
            });
          }

          await refreshEmpresaEmpleados(empresaId);
        }}
      />

      <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--input-border)] p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-3">
            <Users className="w-10 h-10 text-[var(--primary)]" />
            <div>
              <h2 className="text-2xl font-bold text-[var(--foreground)]">Empleados</h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                {isSuperAdmin
                  ? 'Viendo todas las empresas.'
                  : isAdmin
                    ? 'Selecciona una empresa para ver sus empleados.'
                    : 'Viendo tu empresa asignada.'}
              </p>
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            {isAdmin && (
              <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                <Building2 className="w-4 h-4" />
                <select
                  value={selectedEmpresaKey}
                  onChange={(e) => setSelectedEmpresaKey(e.target.value)}
                  className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-md px-3 py-2 text-[var(--foreground)]"
                >
                  {empresaOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <Search className="w-4 h-4" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar empleado..."
                className="bg-[var(--card-bg)] border border-[var(--input-border)] rounded-md px-3 py-2 text-[var(--foreground)]"
              />
            </label>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-sm text-[var(--muted-foreground)]">Cargando empresas...</div>
      )}

      {error && (
        <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--input-border)] p-4 text-sm text-red-500">
          {error}
        </div>
      )}

      {empleadosError && (
        <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--input-border)] p-4 text-sm text-red-500">
          {empleadosError}
        </div>
      )}

      {!loading && !error && visibleEmpresas.length === 0 && (
        <div className="bg-[var(--card-bg)] rounded-lg border border-[var(--input-border)] p-6">
          <div className="text-[var(--foreground)] font-semibold">Sin empresas</div>
          <div className="text-sm text-[var(--muted-foreground)] mt-1">
            {isAdmin
              ? 'No se encontraron empresas asociadas a tu usuario.'
              : 'No se pudo resolver tu empresa asignada o no hay empresas registradas.'}
          </div>
        </div>
      )}

      {!loading && !error && visibleEmpresas.map((empresa) => {
        const label = getEmpresaLabel(empresa);
        const empresaId = String(empresa.id || '').trim();
        const empleadosDocs = empresaId ? (empleadosByEmpresaId[empresaId] || []) : [];

        const embedded = Array.isArray(empresa.empleados) ? empresa.empleados : [];
        const merged = mergeEmpleadosForEmpresa(empresaId, embedded, empleadosDocs);
        const filtered = searchNorm ? merged.filter((x) => normalizeStr(x.name).includes(searchNorm)) : merged;

        return (
          <div key={getEmpresaKey(empresa)} className="bg-[var(--card-bg)] rounded-lg border border-[var(--input-border)] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-[var(--foreground)]">{label}</div>
                <div className="text-sm text-[var(--muted-foreground)]">
                  {merged.length} empleado(s)
                  {empleadosLoading && <span className="ml-2 text-xs">(cargando...)</span>}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.length === 0 ? (
                <div className="text-sm text-[var(--muted-foreground)]">
                  {merged.length === 0 ? 'No hay empleados registrados.' : 'No hay coincidencias para tu búsqueda.'}
                </div>
              ) : (
                filtered.map((entry) => {
                  const doc = entry.doc;
                  const emb = entry.embedded;
                  const complete = doc ? isEmpleadoDetailsComplete(doc) : false;
                  const ccss = String((doc?.ccssType || emb?.ccssType || 'TC') ?? 'TC');
                  const horasDoc = typeof doc?.cantidadHorasTrabaja === 'number' ? doc.cantidadHorasTrabaja : undefined;
                  const horasEmb = emb ? Number(emb.hoursPerShift || 0) : undefined;

                  const fallbackEmpleado: Empleado = {
                    empresaId,
                    Empleado: String(entry.name || '').trim(),
                    ccssType: (ccss === 'MT' ? 'MT' : 'TC'),
                  };

                  const modalEmp = doc || fallbackEmpleado;

                  return (
                    <div
                      key={doc?.id || `${empresaId}::${entry.key}`}
                      className="bg-[var(--card-bg)] rounded-lg border border-[var(--input-border)] p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-[var(--foreground)] truncate">{String(entry.name || '').trim()}</div>
                          <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                            <div>
                              CCSS: {ccss} ·{' '}
                              {horasDoc !== undefined ? (
                                <>Horas: {horasDoc}</>
                              ) : (
                                <>Horas/turno: {horasEmb !== undefined ? horasEmb : '—'}</>
                              )}
                            </div>

                            Fecha Ingreso: {getDisplayedIngresoDate(modalEmp)}
                          </div>
                          <div className="mt-1 text-xs">
                            <span className={complete ? 'text-green-600' : 'text-yellow-600'}>
                              {complete ? 'Ficha completa' : 'Ficha incompleta'}
                            </span>
                          </div>
                        </div>

                        {isAdmin && (
                          <button
                            type="button"
                            className="p-2 rounded-md border border-[var(--input-border)] hover:bg-[var(--hover-bg)]"
                            title="Editar empleado"
                            onClick={() => openEmpleadoModal(modalEmp, false)}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {!isAdmin && (
                        <button
                          type="button"
                          className="mt-3 w-full px-3 py-2 rounded bg-[var(--button-bg)] text-[var(--button-text)] hover:bg-[var(--button-hover)]"
                          onClick={() => openEmpleadoModal(modalEmp, true)}
                        >
                          Ver información
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
