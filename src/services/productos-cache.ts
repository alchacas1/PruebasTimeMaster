import type { ProductEntry } from "@/types/firestore";

import { doc, setDoc } from "firebase/firestore";

import { db } from "@/config/firebase";
import { FirestoreService } from "@/services/firestore";
import { ProductosService } from "@/services/productos";
import { nowCostaRicaISO } from "@/utils/costaRicaTime";

export const PRODUCTOS_KEY = "productos_cache";
const PRODUCTOS_CACHE_EVENT = "pricemaster:productos-cache-change";

type ProductosCacheShape = {
  version: number;
  items: ProductEntry[];
};

function requireCompany(company: string): string {
  const trimmed = String(company || "").trim();
  if (!trimmed) {
    throw new Error("No se pudo determinar la empresa del usuario.");
  }
  if (trimmed.includes("/")) {
    throw new Error('Empresa inválida (no puede contener "/").');
  }
  return trimmed;
}

export function getProductosCacheKey(company: string): string {
  const companyKey = requireCompany(company);
  return `${PRODUCTOS_KEY}_${companyKey}`;
}

function notifyCacheChange(company: string) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(PRODUCTOS_CACHE_EVENT, {
        detail: { company: String(company || "").trim() },
      })
    );
  } catch {
    // ignore
  }
}

function safeParseCache(raw: string | null): ProductosCacheShape | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    const version = obj.version;
    const items = obj.items;

    const versionNum =
      typeof version === "number"
        ? version
        : typeof version === "string"
          ? Number(version)
          : NaN;

    if (!Number.isFinite(versionNum)) return null;
    if (!Array.isArray(items)) return null;

    return {
      version: versionNum,
      items: items as ProductEntry[],
    };
  } catch {
    return null;
  }
}

export function readProductosCache(company: string): ProductosCacheShape | null {
  if (typeof window === "undefined") return null;
  if (typeof localStorage === "undefined") return null;

  const key = getProductosCacheKey(company);
  return safeParseCache(localStorage.getItem(key));
}

export function removeProductosCache(company: string): void {
  if (typeof window === "undefined") return;
  if (typeof localStorage === "undefined") return;

  const key = getProductosCacheKey(company);
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }

  notifyCacheChange(company);
}

export function writeProductosCache(company: string, cache: ProductosCacheShape): void {
  if (typeof window === "undefined") return;
  if (typeof localStorage === "undefined") return;

  const key = getProductosCacheKey(company);
  try {
    localStorage.setItem(key, JSON.stringify(cache));
  } catch {
    // ignore
  }

  notifyCacheChange(company);
}

/**
 * Actualiza el cache en un solo paso lógico (evita eventos intermedios).
 * Útil después de crear/editar/eliminar para no disparar un refetch entre remove y set.
 */
export function refreshProductosCache(company: string, cache: ProductosCacheShape): void {
  if (typeof window === "undefined") return;
  if (typeof localStorage === "undefined") return;

  const key = getProductosCacheKey(company);
  try {
    localStorage.removeItem(key);
    localStorage.setItem(key, JSON.stringify(cache));
  } catch {
    // ignore
  }

  notifyCacheChange(company);
}

export async function obtenerVersionProductos(company: string): Promise<number> {
  const companyKey = requireCompany(company);

  // Consulta ligera: leer el doc raíz de la empresa (productos/{empresa})
  const root = (await FirestoreService.getById("productos", companyKey)) as
    | Record<string, unknown>
    | null;

  const candidate =
    root?.productosVersion ??
    (root as any)?.productos_version ??
    root?.version ??
    (root as any)?.updatedAt;

  if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  if (typeof candidate === "string") {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

export async function bumpProductosVersion(company: string): Promise<number> {
  const companyKey = requireCompany(company);

  // Número monotónico y simple; evita condiciones de carrera de incrementos.
  const nextVersion = Date.now();

  const ref = doc(db, "productos", companyKey);
  await setDoc(
    ref,
    {
      company: companyKey,
      productosVersion: nextVersion,
      updatedAt: nowCostaRicaISO(),
    },
    { merge: true }
  );

  return nextVersion;
}

export async function obtenerProductosFirestore(company: string): Promise<ProductEntry[]> {
  const companyKey = requireCompany(company);
  return await ProductosService.getProductosOrderedByNombre(companyKey);
}

export async function cargarProductos(company: string): Promise<ProductEntry[]> {
  const companyKey = requireCompany(company);

  // En SSR o entornos sin localStorage, cae a Firestore directo.
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return await obtenerProductosFirestore(companyKey);
  }

  const cache = readProductosCache(companyKey);

  // 🔹 traer versión remota (consulta ligera)
  const versionRemota = await obtenerVersionProductos(companyKey);

  // 🔹 usar cache si está vigente
  if (cache && cache.version === versionRemota) {
    return cache.items;
  }

  // 🔹 si no coincide → traer productos
  const productos = await obtenerProductosFirestore(companyKey);

  writeProductosCache(companyKey, {
    version: versionRemota,
    items: productos,
  });

  return productos;
}

export function onProductosCacheChange(callback: (company: string) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = (event: Event) => {
    const detail = (event as CustomEvent)?.detail as { company?: unknown } | undefined;
    const company = String(detail?.company || "").trim();
    callback(company);
  };

  window.addEventListener(PRODUCTOS_CACHE_EVENT, handler as EventListener);
  return () => window.removeEventListener(PRODUCTOS_CACHE_EVENT, handler as EventListener);
}
