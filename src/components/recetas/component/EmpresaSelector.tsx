"use client";

import React from "react";

import { EmpresasService } from "@/services/empresas";

type EmpresaSelectorProps = {
  authLoading: boolean;
  isAdminLike: boolean;
  userRole?: string;
  actorOwnerIds?: Array<string | number>;
  companyFromUser: string;

  selectedEmpresa: string;
  setSelectedEmpresa: (next: string) => void;

  setEmpresaError?: (msg: string | null) => void;
  onCompanyChanged?: (next: string) => void;
};

export function EmpresaSelector({
  authLoading,
  isAdminLike,
  userRole,
  actorOwnerIds,
  companyFromUser,
  selectedEmpresa,
  setSelectedEmpresa,
  setEmpresaError,
  onCompanyChanged,
}: EmpresaSelectorProps) {
  const [empresaOptions, setEmpresaOptions] = React.useState<string[]>([]);
  const [empresaLoading, setEmpresaLoading] = React.useState(false);

  React.useEffect(() => {
    if (authLoading) return;
    if (!isAdminLike) return;

    let cancelled = false;
    const loadEmpresas = async () => {
      setEmpresaLoading(true);
      setEmpresaError?.(null);
      try {
        const all = await EmpresasService.getAllEmpresas();
        const normalized = Array.isArray(all) ? all : [];

        let filtered = normalized;
        if (userRole !== "superadmin") {
          const allowed = new Set((actorOwnerIds || []).map((id) => String(id)));
          if (allowed.size > 0) {
            filtered = normalized.filter((e: any) => e && e.ownerId && allowed.has(String(e.ownerId)));
          }
        }

        const names = filtered
          .map((e: any) => String(e?.name || "").trim())
          .filter((n: string) => n.length > 0);

        const merged = companyFromUser && !names.includes(companyFromUser) ? [companyFromUser, ...names] : names;

        const unique: string[] = [];
        for (const n of merged) {
          if (!unique.includes(n)) unique.push(n);
        }

        if (cancelled) return;
        setEmpresaOptions(unique);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "No se pudieron cargar las empresas.";
        setEmpresaError?.(msg);
        setEmpresaOptions([]);
      } finally {
        if (!cancelled) setEmpresaLoading(false);
      }
    };

    void loadEmpresas();
    return () => {
      cancelled = true;
    };
  }, [actorOwnerIds, authLoading, companyFromUser, isAdminLike, setEmpresaError, userRole]);

  React.useEffect(() => {
    if (!isAdminLike) return;
    if (authLoading) return;
    if (selectedEmpresa) return;

    if (companyFromUser) {
      setSelectedEmpresa(companyFromUser);
      return;
    }

    if (empresaOptions.length > 0) {
      setSelectedEmpresa(empresaOptions[0]);
    }
  }, [authLoading, companyFromUser, empresaOptions, isAdminLike, selectedEmpresa, setSelectedEmpresa]);

  if (!isAdminLike) return null;

  return (
    <div className="flex flex-col gap-1 w-full md:w-auto">
      <label className="text-[10px] sm:text-xs text-[var(--muted-foreground)]">Empresas</label>
      <select
        value={selectedEmpresa}
        onChange={(e) => {
          const next = e.target.value;
          setSelectedEmpresa(next);
          onCompanyChanged?.(next);
        }}
        disabled={empresaLoading}
        className="w-full md:min-w-[260px] px-3 py-2.5 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        aria-label="Seleccionar empresa"
      >
        {empresaOptions.length === 0 ? (
          <option value={selectedEmpresa || ""}>{empresaLoading ? "Cargando empresas..." : "Sin empresas"}</option>
        ) : (
          empresaOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
