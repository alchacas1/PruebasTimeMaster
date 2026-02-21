import { useCallback, useEffect, useMemo, useState } from "react";
import { ProductosService } from "../services/productos";
import type { ProductEntry } from "../types/firestore";
import { useAuth } from "./useAuth";
import {
  bumpProductosVersion,
  cargarProductos,
  onProductosCacheChange,
  readProductosCache,
  refreshProductosCache,
} from "@/services/productos-cache";

type MutationCallbacks<T> = {
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
};

export function useProductos(options?: { companyOverride?: string }) {
  const { user, loading: authLoading } = useAuth();
  const companyFromUser = useMemo(() => (user?.ownercompanie || "").trim(), [user?.ownercompanie]);
  const isAdminLike = user?.role === 'admin' || user?.role === 'superadmin';
  const requestedOverride = useMemo(() => String(options?.companyOverride || "").trim(), [options?.companyOverride]);
  const company = useMemo(() => {
    if (isAdminLike && requestedOverride) return requestedOverride;
    return companyFromUser;
  }, [companyFromUser, isAdminLike, requestedOverride]);
  const noCompanyMessage = "No se pudo determinar la empresa del usuario.";

  const [productos, setProductos] = useState<ProductEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProductos = useCallback(async () => {
    // Esperar a que auth resuelva para evitar consultas con empresa vacía.
    if (authLoading) {
      return;
    }

    if (!company) {
      setProductos([]);
      setError(user ? noCompanyMessage : null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await cargarProductos(company);
      setProductos(data);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Error al cargar los productos.";
      setError(message);
      console.error("Error fetching productos:", err);
    } finally {
      setLoading(false);
    }
  }, [authLoading, company, noCompanyMessage, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    return onProductosCacheChange((changedCompany) => {
      if (!changedCompany) return;
      if (changedCompany !== company) return;

      const cache = readProductosCache(company);
      if (cache) {
        setProductos(cache.items);
        return;
      }

      void fetchProductos();
    });
  }, [company, fetchProductos]);

  const addProducto = useCallback(
    async (input: {
      nombre: string;
      descripcion?: string;
      pesoengramos: number;
      precio: number;
    }, callbacks?: MutationCallbacks<ProductEntry>) => {
      try {
        setError(null);
        if (!company) {
          throw new Error(noCompanyMessage);
        }
        const created = await ProductosService.addProducto(company, input);

        let next: ProductEntry[] = [];
        setProductos((prev) => {
          next = [...prev.filter((p) => p.id !== created.id), created];
          next.sort((a, b) =>
            a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
          );
          return next;
        });

        const nextVersion = await bumpProductosVersion(company);
        refreshProductosCache(company, { version: nextVersion, items: next });

        callbacks?.onSuccess?.(created);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "No se pudo guardar el producto.";
        setError(message);
        console.error("Error adding producto:", err);
        const asError = err instanceof Error ? err : new Error(message);
        callbacks?.onError?.(asError);
        throw asError;
      }
    },
    [company, noCompanyMessage]
  );

  const updateProducto = useCallback(
    async (
      id: string,
      patch: Partial<
        Omit<ProductEntry, "id" | "createdAt" | "precioxgramo">
      >
    , callbacks?: MutationCallbacks<ProductEntry>) => {
      try {
        setError(null);
        if (!company) {
          throw new Error(noCompanyMessage);
        }
        const updated = await ProductosService.updateProducto(company, id, patch);

        let next: ProductEntry[] = [];
        setProductos((prev) => {
          next = [...prev.filter((p) => p.id !== updated.id), updated];
          next.sort((a, b) =>
            a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
          );
          return next;
        });

        const nextVersion = await bumpProductosVersion(company);
        refreshProductosCache(company, { version: nextVersion, items: next });

        callbacks?.onSuccess?.(updated);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "No se pudo actualizar el producto.";
        setError(message);
        console.error("Error updating producto:", err);
        const asError = err instanceof Error ? err : new Error(message);
        callbacks?.onError?.(asError);
        throw asError;
      }
    },
    [company, noCompanyMessage]
  );

  const removeProducto = useCallback(
    async (id: string, callbacks?: MutationCallbacks<void>) => {
      try {
        setError(null);
        if (!company) {
          throw new Error(noCompanyMessage);
        }
        await ProductosService.deleteProducto(company, id);

        let next: ProductEntry[] = [];
        setProductos((prev) => {
          next = prev.filter((p) => p.id !== id);
          return next;
        });

        const nextVersion = await bumpProductosVersion(company);
        refreshProductosCache(company, { version: nextVersion, items: next });

        callbacks?.onSuccess?.(undefined);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "No se pudo eliminar el producto.";
        setError(message);
        console.error("Error removing producto:", err);
        const asError = err instanceof Error ? err : new Error(message);
        callbacks?.onError?.(asError);
        throw asError;
      }
    },
    [company, noCompanyMessage]
  );

  useEffect(() => {
    void fetchProductos();
  }, [fetchProductos]);

  return {
    productos,
    loading,
    error,
    addProducto,
    updateProducto,
    removeProducto,
    refetch: fetchProductos,
  };
}
