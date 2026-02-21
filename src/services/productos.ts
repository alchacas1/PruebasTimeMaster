import { FirestoreService } from "./firestore";
import type { ProductEntry } from "../types/firestore";
import { nowCostaRicaISO } from "../utils/costaRicaTime";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/config/firebase";

export class ProductosService {
  private static readonly COLLECTION_NAME = "productos";
  private static readonly ITEMS_SUBCOLLECTION = "items";

  private static requireCompany(company: string): string {
    const trimmed = String(company || "").trim();
    if (!trimmed) {
      throw new Error("No se pudo determinar la empresa del usuario.");
    }
    if (trimmed.includes("/")) {
      throw new Error('Empresa inválida (no puede contener "/").');
    }
    return trimmed;
  }

  private static productosCollectionPath(company: string): string {
    const companyKey = this.requireCompany(company);
    return `${this.COLLECTION_NAME}/${companyKey}/${this.ITEMS_SUBCOLLECTION}`;
  }

  private static async ensureCompanyRootDoc(company: string): Promise<void> {
    const companyKey = this.requireCompany(company);
    const ref = doc(db, this.COLLECTION_NAME, companyKey);
    const nowISO = nowCostaRicaISO();
    await setDoc(
      ref,
      {
        company: companyKey,
        updatedAt: nowISO,
      },
      { merge: true }
    );
  }

  private static slugifyForId(value: string): string {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "producto";

    const cleaned = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);

    return cleaned || "producto";
  }

  static buildProductoId(nombre: string): string {
    return this.slugifyForId(nombre);
  }

  private static sanitizeNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const trimmed = value.trim().replace(/,/g, ".");
      if (!trimmed) return 0;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private static computePrecioXGramo(precio: number, pesoengramos: number): number {
    if (!Number.isFinite(precio) || !Number.isFinite(pesoengramos)) return 0;
    if (pesoengramos <= 0) return 0;
    return precio / pesoengramos;
  }

  private static normalizeProductDoc(
    raw: unknown,
    fallbackId: string
  ): ProductEntry | null {
    if (!raw || typeof raw !== "object") return null;
    const data = raw as Record<string, unknown>;

    const nombre = String(data.nombre ?? (data as any).name ?? "").trim();
    if (!nombre) return null;

    const id = String(data.id ?? fallbackId ?? "").trim();
    if (!id) return null;

    const descripcionRaw = data.descripcion ?? (data as any).description;
    const descripcion =
      typeof descripcionRaw === "string" ? descripcionRaw.trim() : undefined;

    const pesoengramos = this.sanitizeNumber(data.pesoengramos ?? (data as any).pesoEnGramos);
    const precio = this.sanitizeNumber(data.precio);
    const precioxgramoStored = this.sanitizeNumber(data.precioxgramo);
    const precioxgramo =
      precioxgramoStored > 0
        ? precioxgramoStored
        : this.computePrecioXGramo(precio, pesoengramos);

    const createdAt = typeof data.createdAt === "string" ? data.createdAt : undefined;
    const updateAt = typeof (data as any).updateAt === "string" ? (data as any).updateAt : undefined;

    return {
      id,
      nombre,
      descripcion,
      pesoengramos,
      precio,
      precioxgramo,
      createdAt,
      updateAt,
    };
  }

  static async getProductosOrderedByNombre(company: string): Promise<ProductEntry[]> {
    const collectionPath = this.productosCollectionPath(company);
    const rows = (await FirestoreService.query(
      collectionPath,
      [],
      "nombre",
      "asc"
    )) as Array<Record<string, unknown>>;

    return rows
      .map((row) => this.normalizeProductDoc(row, String(row?.id ?? "").trim()))
      .filter((p): p is ProductEntry => p !== null);
  }

  static async searchProductosByNombrePrefix(
    company: string,
    prefix: string,
    limitCount = 20
  ): Promise<ProductEntry[]> {
    const collectionPath = this.productosCollectionPath(company);
    const trimmed = String(prefix || "").trim();
    if (!trimmed) return [];

    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limitCount)));

    const runQuery = async (term: string) => {
      const upperBound = `${term}\uf8ff`;
      const rows = (await FirestoreService.query(
        collectionPath,
        [
          { field: "nombre", operator: ">=", value: term },
          { field: "nombre", operator: "<=", value: upperBound },
        ],
        "nombre",
        "asc",
        safeLimit
      )) as Array<Record<string, unknown>>;

      return rows
        .map((row) => this.normalizeProductDoc(row, String(row?.id ?? "").trim()))
        .filter((p): p is ProductEntry => p !== null);
    };

    const variants = new Set<string>();
    variants.add(trimmed);
    // Intento 2: capitalizar primera letra (ayuda cuando los nombres están con mayúscula inicial)
    const cap = trimmed.length > 0 ? trimmed[0].toUpperCase() + trimmed.slice(1) : trimmed;
    if (cap && cap !== trimmed) variants.add(cap);

    const results = await Promise.all(Array.from(variants).map((v) => runQuery(v)));

    const merged: ProductEntry[] = [];
    const seen = new Set<string>();
    for (const list of results) {
      for (const item of list) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        merged.push(item);
        if (merged.length >= safeLimit) break;
      }
      if (merged.length >= safeLimit) break;
    }

    return merged;
  }

  static async addProducto(
    company: string,
    input: {
    nombre: string;
    descripcion?: string;
    pesoengramos: number;
    precio: number;
    }
  ): Promise<ProductEntry> {
    const collectionPath = this.productosCollectionPath(company);
    const nombre = String(input.nombre || "").trim();
    if (!nombre) throw new Error("Nombre requerido.");

    const pesoengramos = this.sanitizeNumber(input.pesoengramos);
    const precio = this.sanitizeNumber(input.precio);
    if (pesoengramos <= 0) throw new Error("El peso en gramos debe ser mayor a 0.");
    if (precio < 0) throw new Error("El precio no puede ser negativo.");

    const id = this.buildProductoId(nombre);

    const exists = await FirestoreService.exists(collectionPath, id);
    if (exists) {
      throw new Error(`Ya existe un producto con id "${id}".`);
    }

    const nowISO = nowCostaRicaISO();

    const data: ProductEntry = {
      id,
      nombre,
      descripcion: input.descripcion ? String(input.descripcion).trim() : undefined,
      pesoengramos,
      precio,
      precioxgramo: this.computePrecioXGramo(precio, pesoengramos),
      createdAt: nowISO,
      updateAt: nowISO,
    };

    await this.ensureCompanyRootDoc(company);
    await FirestoreService.addWithId(collectionPath, id, data);
    return data;
  }

  static async updateProducto(
    company: string,
    id: string,
    patch: Partial<Omit<ProductEntry, "id" | "createdAt" | "precioxgramo">>
  ): Promise<ProductEntry> {
    const collectionPath = this.productosCollectionPath(company);
    const docId = String(id || "").trim();
    if (!docId) throw new Error("id requerido.");

    const updateData: Partial<ProductEntry> = {
      ...patch,
      updateAt: nowCostaRicaISO(),
    };

    if (updateData.nombre !== undefined) {
      updateData.nombre = String(updateData.nombre || "").trim();
      if (!updateData.nombre) throw new Error("Nombre requerido.");
    }

    if (updateData.descripcion !== undefined) {
      updateData.descripcion = String(updateData.descripcion || "").trim();
    }

    if (updateData.pesoengramos !== undefined) {
      updateData.pesoengramos = this.sanitizeNumber(updateData.pesoengramos);
      if (updateData.pesoengramos <= 0) {
        throw new Error("El peso en gramos debe ser mayor a 0.");
      }
    }

    if (updateData.precio !== undefined) {
      updateData.precio = this.sanitizeNumber(updateData.precio);
      if (updateData.precio < 0) throw new Error("El precio no puede ser negativo.");
    }

    // Recalcular precioxgramo si cambia precio o pesoengramos
    if (updateData.precio !== undefined || updateData.pesoengramos !== undefined) {
      const current = (await FirestoreService.getById(collectionPath, docId)) as Record<string, unknown> | null;
      const normalized = current
        ? this.normalizeProductDoc(current, docId)
        : null;
      const basePrecio = updateData.precio ?? normalized?.precio ?? 0;
      const basePeso = updateData.pesoengramos ?? normalized?.pesoengramos ?? 0;
      updateData.precioxgramo = this.computePrecioXGramo(basePrecio, basePeso);
    }

    await this.ensureCompanyRootDoc(company);
    await FirestoreService.update(collectionPath, docId, updateData);

    const updated = (await FirestoreService.getById(
      collectionPath,
      docId
    )) as Record<string, unknown> | null;

    const normalized = updated ? this.normalizeProductDoc(updated, docId) : null;
    if (!normalized) {
      throw new Error("No se pudo leer el producto actualizado.");
    }
    return normalized;
  }

  static async deleteProducto(company: string, id: string): Promise<void> {
    const collectionPath = this.productosCollectionPath(company);
    const docId = String(id || "").trim();
    if (!docId) return;
    await FirestoreService.delete(collectionPath, docId);
  }
}
