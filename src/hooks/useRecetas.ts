import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "./useAuth";
import { RecetasService } from "@/services/recetas";
import type { RecetaEntry } from "@/types/firestore";

type MutationCallbacks<T> = {
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
};

export function useRecetas(options?: { companyOverride?: string }) {
  const { user, loading: authLoading } = useAuth();

  const companyFromUser = useMemo(() => (user?.ownercompanie || "").trim(), [user?.ownercompanie]);
  const isAdminLike = user?.role === "admin" || user?.role === "superadmin";
  const requestedOverride = useMemo(() => String(options?.companyOverride || "").trim(), [options?.companyOverride]);
  const company = useMemo(() => {
    if (isAdminLike && requestedOverride) return requestedOverride;
    return companyFromUser;
  }, [companyFromUser, isAdminLike, requestedOverride]);
  const noCompanyMessage = "No se pudo determinar la empresa del usuario.";

  const [recetas, setRecetas] = useState<RecetaEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecetas = useCallback(async () => {
    if (authLoading) return;

    if (!company) {
      setRecetas([]);
      setError(user ? noCompanyMessage : null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await RecetasService.getRecetasOrderedByNombre(company);
      setRecetas(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al cargar las recetas.";
      setError(message);
      console.error("Error fetching recetas:", err);
    } finally {
      setLoading(false);
    }
  }, [authLoading, company, noCompanyMessage, user]);

  const addReceta = useCallback(
    async (
      input: {
        nombre: string;
        descripcion?: string;
        productos: Array<{ productId: string; gramos: number }>;
        iva?: number;
        margen: number;
      },
      callbacks?: MutationCallbacks<RecetaEntry>
    ) => {
      try {
        setError(null);
        if (!company) throw new Error(noCompanyMessage);

        const created = await RecetasService.addReceta(company, input);
        setRecetas((prev) => {
          const next = [...prev.filter((r) => r.id !== created.id), created];
          next.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
          return next;
        });

        callbacks?.onSuccess?.(created);
        return created;
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo guardar la receta.";
        setError(message);
        console.error("Error adding receta:", err);
        const asError = err instanceof Error ? err : new Error(message);
        callbacks?.onError?.(asError);
        throw asError;
      }
    },
    [company, noCompanyMessage]
  );

  const removeReceta = useCallback(
    async (id: string, callbacks?: MutationCallbacks<void>) => {
      try {
        setError(null);
        if (!company) throw new Error(noCompanyMessage);

        await RecetasService.deleteReceta(company, id);
        setRecetas((prev) => prev.filter((r) => r.id !== id));
        callbacks?.onSuccess?.(undefined);
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo eliminar la receta.";
        setError(message);
        console.error("Error removing receta:", err);
        const asError = err instanceof Error ? err : new Error(message);
        callbacks?.onError?.(asError);
        throw asError;
      }
    },
    [company, noCompanyMessage]
  );

  const updateReceta = useCallback(
    async (
      id: string,
      input: {
        nombre: string;
        descripcion?: string | null;
        productos: Array<{ productId: string; gramos: number }>;
        iva?: number;
        margen: number;
      },
      callbacks?: MutationCallbacks<RecetaEntry>
    ) => {
      try {
        setError(null);
        if (!company) throw new Error(noCompanyMessage);

        const updated = await RecetasService.updateReceta(company, id, input);
        setRecetas((prev) => {
          const next = prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r));
          next.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
          return next;
        });

        callbacks?.onSuccess?.(updated);
        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo actualizar la receta.";
        setError(message);
        console.error("Error updating receta:", err);
        const asError = err instanceof Error ? err : new Error(message);
        callbacks?.onError?.(asError);
        throw asError;
      }
    },
    [company, noCompanyMessage]
  );

  useEffect(() => {
    void fetchRecetas();
  }, [fetchRecetas]);

  return {
    recetas,
    loading,
    error,
    addReceta,
    updateReceta,
    removeReceta,
    refetch: fetchRecetas,
  };
}
