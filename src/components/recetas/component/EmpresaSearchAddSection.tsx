"use client";

import React from "react";
import { Plus, Search } from "lucide-react";

import { EmpresaSelector } from "@/components/recetas/component/EmpresaSelector";

type EmpresaSearchAddSectionProps = {
  authLoading: boolean;
  isAdminLike: boolean;
  userRole?: string;
  actorOwnerIds?: Array<string | number>;
  companyFromUser: string;

  selectedEmpresa: string;
  setSelectedEmpresa: (next: string) => void;
  setEmpresaError?: (msg: string | null) => void;
  onCompanyChanged?: (next: string) => void;

  searchValue: string;
  onSearchValueChange: (next: string) => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
  searchDisabled?: boolean;

  addButtonText: string;
  onAddClick: () => void;
  addDisabled?: boolean;
};

export function EmpresaSearchAddSection({
  authLoading,
  isAdminLike,
  userRole,
  actorOwnerIds,
  companyFromUser,
  selectedEmpresa,
  setSelectedEmpresa,
  setEmpresaError,
  onCompanyChanged,
  searchValue,
  onSearchValueChange,
  searchPlaceholder,
  searchAriaLabel,
  searchDisabled,
  addButtonText,
  onAddClick,
  addDisabled,
}: EmpresaSearchAddSectionProps) {
  return (
    <>
      <EmpresaSelector
        authLoading={authLoading}
        isAdminLike={isAdminLike}
        userRole={userRole}
        actorOwnerIds={actorOwnerIds}
        companyFromUser={companyFromUser}
        selectedEmpresa={selectedEmpresa}
        setSelectedEmpresa={setSelectedEmpresa}
        setEmpresaError={setEmpresaError}
        onCompanyChanged={onCompanyChanged}
      />

      <div className="flex w-full md:flex-1 flex-col md:flex-row md:flex-nowrap items-stretch md:items-end gap-2 md:gap-3">
        <div className="w-full md:w-auto md:flex-1 md:min-w-0 lg:min-w-[260px]">
          <label className="text-[10px] sm:text-xs text-[var(--muted-foreground)] md:invisible">Buscar</label>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <input
              value={searchValue}
              onChange={(e) => onSearchValueChange(e.target.value)}
              className="w-full px-3 py-2.5 pr-10 bg-[var(--input-bg)] border border-[var(--input-border)] rounded text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              placeholder={searchPlaceholder}
              aria-label={searchAriaLabel}
              disabled={Boolean(searchDisabled)}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onAddClick}
          disabled={Boolean(addDisabled)}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--accent)] text-white rounded-lg shadow-sm ring-1 ring-white/10 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{addButtonText}</span>
        </button>
      </div>
    </>
  );
}
