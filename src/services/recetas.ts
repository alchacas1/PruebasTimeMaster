import { doc, setDoc } from "firebase/firestore";

import { db } from "@/config/firebase";
import { FirestoreService } from "./firestore";
import type { RecetaEntry, RecetaProductoItem } from "@/types/firestore";
import { nowCostaRicaISO } from "@/utils/costaRicaTime";

export class RecetasService {
  private static readonly COLLECTION_NAME = "recetas";
  private static readonly ITEMS_SUBCOLLECTION = "items";
  private static readonly DEFAULT_IVA_RATE = 0.13;

  private static normalizeRate(value: unknown, fallback: number): number {
    let rate = this.sanitizeNumber(value);
    // Soportar entrada tipo "13" (porcentaje)
    if (rate > 1 && rate <= 100) rate = rate / 100;
    if (!(rate >= 0 && rate <= 1)) {
      throw new Error("El IVA debe estar entre 0 y 1 (ej: 0.13) o 0-100 (ej: 13)." );
    }
    // Si llega vacío (0) y se desea fallback explícito
    return Number.isFinite(rate) ? rate : fallback;
  }

  private static coerceRateOrFallback(value: unknown, fallback: number): number {
    let rate = this.sanitizeNumber(value);
    if (rate > 1 && rate <= 100) rate = rate / 100;
    if (!(rate >= 0 && rate <= 1)) return fallback;
    return Number.isFinite(rate) ? rate : fallback;
  }

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

  private static recetasCollectionPath(company: string): string {
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
    if (!raw) return "receta";

    const cleaned = raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);

    return cleaned || "receta";
  }

  static buildRecetaId(nombre: string): string {
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

  private static normalizeProductos(raw: unknown): RecetaProductoItem[] {
    if (!Array.isArray(raw)) return [];
    const items: RecetaProductoItem[] = [];

    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      const productId = String(row.productId ?? "").trim();
      const gramos = this.sanitizeNumber(row.gramos);
      if (!productId) continue;
      if (!(gramos > 0)) continue;
      items.push({ productId, gramos });
    }

    return items;
  }

  private static normalizeRecetaDoc(raw: unknown, fallbackId: string): RecetaEntry | null {
    if (!raw || typeof raw !== "object") return null;
    const data = raw as Record<string, unknown>;

    const nombre = String(data.nombre ?? "").trim();
    if (!nombre) return null;

    const id = String(data.id ?? fallbackId ?? "").trim();
    if (!id) return null;

    const descripcion =
      typeof data.descripcion === "string" ? data.descripcion.trim() : undefined;

    const margen = this.sanitizeNumber(data.margen);
    const iva = Object.prototype.hasOwnProperty.call(data, "iva")
      ? this.coerceRateOrFallback(data.iva, this.DEFAULT_IVA_RATE)
      : this.DEFAULT_IVA_RATE;
    const productos = this.normalizeProductos(data.productos);

    const createdAt = typeof data.createdAt === "string" ? data.createdAt : undefined;
    const updateAt = typeof (data as any).updateAt === "string" ? (data as any).updateAt : undefined;

    return {
      id,
      nombre,
      descripcion,
      productos,
      iva,
      margen,
      createdAt,
      updateAt,
    };
  }

  static async getRecetasOrderedByNombre(company: string): Promise<RecetaEntry[]> {
    const collectionPath = this.recetasCollectionPath(company);
    const rows = (await FirestoreService.query(
      collectionPath,
      [],
      "nombre",
      "asc"
    )) as Array<Record<string, unknown>>;

    return rows
      .map((row) => this.normalizeRecetaDoc(row, String(row?.id ?? "").trim()))
      .filter((r): r is RecetaEntry => r !== null);
  }

  static async addReceta(
    company: string,
    input: {
      nombre: string;
      descripcion?: string;
      productos: Array<{ productId: string; gramos: number }>;
      iva?: number;
      margen: number;
    }
  ): Promise<RecetaEntry> {
    const collectionPath = this.recetasCollectionPath(company);
    const nombre = String(input.nombre || "").trim();
    if (!nombre) throw new Error("Nombre requerido.");

    const margen = this.sanitizeNumber(input.margen);
    if (!(margen >= 0 && margen <= 1)) {
      throw new Error("El margen debe estar entre 0 y 1 (ej: 0.35)." );
    }

    const iva =
      typeof input.iva === "number" || typeof input.iva === "string"
        ? this.normalizeRate(input.iva, this.DEFAULT_IVA_RATE)
        : this.DEFAULT_IVA_RATE;

    const productos = (Array.isArray(input.productos) ? input.productos : [])
      .map((p) => ({
        productId: String(p.productId || "").trim(),
        gramos: this.sanitizeNumber(p.gramos),
      }))
      .filter((p) => p.productId && p.gramos > 0);

    if (productos.length === 0) {
      throw new Error("Debe agregar al menos un producto con gramos > 0.");
    }

    const id = this.buildRecetaId(nombre);
    const exists = await FirestoreService.exists(collectionPath, id);
    if (exists) {
      throw new Error(`Ya existe una receta con id "${id}".`);
    }

    const nowISO = nowCostaRicaISO();

    const data: RecetaEntry = {
      id,
      nombre,
      descripcion: input.descripcion ? String(input.descripcion).trim() : undefined,
      productos,
      iva,
      margen,
      createdAt: nowISO,
      updateAt: nowISO,
    };

    await this.ensureCompanyRootDoc(company);
    await FirestoreService.addWithId(collectionPath, id, data);
    return data;
  }

  static async deleteReceta(company: string, id: string): Promise<void> {
    const collectionPath = this.recetasCollectionPath(company);
    const docId = String(id || "").trim();
    if (!docId) return;
    await FirestoreService.delete(collectionPath, docId);
  }

  static async updateReceta(
    company: string,
    id: string,
    input: {
      nombre: string;
      descripcion?: string | null;
      productos: Array<{ productId: string; gramos: number }>;
      iva?: number;
      margen: number;
    }
  ): Promise<RecetaEntry> {
    const collectionPath = this.recetasCollectionPath(company);
    const docId = String(id || "").trim();
    if (!docId) throw new Error("Id requerido.");

    const nombre = String(input.nombre || "").trim();
    if (!nombre) throw new Error("Nombre requerido.");

    const margen = this.sanitizeNumber(input.margen);
    if (!(margen >= 0 && margen <= 1)) {
      throw new Error('El margen debe estar entre 0 y 1 (ej: 0.35).');
    }

    const iva =
      typeof input.iva === "number" || typeof input.iva === "string"
        ? this.normalizeRate(input.iva, this.DEFAULT_IVA_RATE)
        : this.DEFAULT_IVA_RATE;

    const productos = (Array.isArray(input.productos) ? input.productos : [])
      .map((p) => ({
        productId: String(p.productId || "").trim(),
        gramos: this.sanitizeNumber(p.gramos),
      }))
      .filter((p) => p.productId && p.gramos > 0);

    if (productos.length === 0) {
      throw new Error("Debe agregar al menos un producto con gramos > 0.");
    }

    const descripcionValueRaw = input.descripcion;
    const descripcionTrimmed =
      typeof descripcionValueRaw === "string" ? descripcionValueRaw.trim() : "";
    const descripcion = descripcionTrimmed.length > 0 ? descripcionTrimmed : null;

    const nowISO = nowCostaRicaISO();

    await this.ensureCompanyRootDoc(company);
    await FirestoreService.update(collectionPath, docId, {
      nombre,
      descripcion,
      productos,
      iva,
      margen,
      updateAt: nowISO,
    });

    const updated: RecetaEntry = {
      id: docId,
      nombre,
      descripcion: descripcion ?? undefined,
      productos,
      iva,
      margen,
      updateAt: nowISO,
    };

    return updated;
  }
}
