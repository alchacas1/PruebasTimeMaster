import { FirestoreService } from './firestore';
import type { Empleado } from '../types/firestore';

// Cache configuration
// Default TTL for list-by-empresaId lookups. Updates/inserts clear the cache.
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class EmpleadosService {
  private static readonly COLLECTION_NAME = 'empleados';
  
  // In-memory cache for empleados by empresaId
  private static cache = new Map<string, CacheEntry<Empleado[]>>();

  // De-dupe concurrent requests (per empresaId)
  private static inFlight = new Map<string, Promise<Empleado[]>>();

  private static isCacheValid(entry: CacheEntry<unknown> | undefined): boolean {
    if (!entry) return false;
    return Date.now() - entry.timestamp < CACHE_TTL_MS;
  }

  /**
   * Clear cache for a specific empresaId or all cache if no id provided
   */
  static clearCache(empresaId?: string): void {
    if (empresaId) {
      this.cache.delete(empresaId);
      this.inFlight.delete(empresaId);
    } else {
      this.cache.clear();
      this.inFlight.clear();
    }
  }

  private static slugifyForId(value: string): string {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return 'empleado';
    // Keep it Firestore-id friendly (no slashes)
    const cleaned = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    return cleaned || 'empleado';
  }

  static buildEmpleadoId(empresaId: string, empleadoNombre: string): string {
    const eid = String(empresaId || '').trim();
    const slug = this.slugifyForId(empleadoNombre);
    // Avoid '/' in doc ids; company ids typically safe, but sanitize anyway
    const safeEmpresa = eid.replace(/\//g, '_');
    return `${safeEmpresa}__${slug}`;
  }

  private static normalizeEmpleadoDoc(raw: unknown, empresaId: string): Omit<Empleado, 'id'> {
    const obj = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
    const nombre = String((obj as any).Empleado ?? (obj as any).name ?? '').trim();
    const ccssRaw = String((obj as any).ccssType ?? '').trim();
    const ccssType: 'TC' | 'MT' | 'PH' = (ccssRaw === 'MT' || ccssRaw === 'TC' || ccssRaw === 'PH')
      ? (ccssRaw as 'TC' | 'MT' | 'PH')
      : 'TC';
    return {
      empresaId,
      Empleado: nombre,
      ccssType,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  static async getByEmpresaId(empresaId: string, forceRefresh = false): Promise<Empleado[]> {
    const id = String(empresaId || '').trim();
    if (!id) return [];

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = this.cache.get(id);
      if (this.isCacheValid(cached)) {
        return cached!.data;
      }
    }

    // De-dupe concurrent loads for the same empresaId
    const existing = this.inFlight.get(id);
    if (existing) return existing;

    const promise = (async () => {
      // Fetch from Firestore
      const result = await FirestoreService.query(this.COLLECTION_NAME, [
        { field: 'empresaId', operator: '==', value: id },
      ]) as Empleado[];

      // Store in cache
      this.cache.set(id, {
        data: result,
        timestamp: Date.now(),
      });

      return result;
    })();

    this.inFlight.set(id, promise);
    try {
      return await promise;
    } finally {
      // Always release in-flight marker, success or failure
      this.inFlight.delete(id);
    }
  }

  static async addEmpleado(empleado: Omit<Empleado, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const empresaId = String(empleado.empresaId || '').trim();
    if (!empresaId) throw new Error('empresaId es requerido para crear un empleado');

    const data: Omit<Empleado, 'id'> = {
      ...this.normalizeEmpleadoDoc(empleado, empresaId),
      // preserve optional ownerId if provided
      ownerId: empleado.ownerId,

      // extra fields
      pagoHoraBruta: empleado.pagoHoraBruta,
      diaContratacion: empleado.diaContratacion,
      paganAguinaldo: empleado.paganAguinaldo,
      cantidadHorasTrabaja: empleado.cantidadHorasTrabaja,
      danReciboPago: empleado.danReciboPago,
      contratoFisico: empleado.contratoFisico,
      espacioComida: empleado.espacioComida,
      brindanVacaciones: empleado.brindanVacaciones,
      incluidoCCSS: empleado.incluidoCCSS,
      incluidoINS: empleado.incluidoINS,
      preguntasExtra: empleado.preguntasExtra,
    };

    const newId = await FirestoreService.add(this.COLLECTION_NAME, data);
    // Invalidate cache for this empresa
    this.clearCache(empresaId);
    return newId;
  }

  /**
   * Upsert determinístico por (empresaId + Empleado).
   * Útil cuando vienes de una lista embebida (sin id) y quieres empezar a guardar detalles.
   */
  static async upsertEmpleadoByEmpresaAndName(
    empleado: Omit<Empleado, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const empresaId = String(empleado.empresaId || '').trim();
    const nombre = String(empleado.Empleado || '').trim();
    if (!empresaId) throw new Error('empresaId es requerido');
    if (!nombre) throw new Error('Empleado (nombre) es requerido');

    const id = this.buildEmpleadoId(empresaId, nombre);
    const exists = await FirestoreService.exists(this.COLLECTION_NAME, id);

    if (exists) {
      await this.updateEmpleado(id, { ...empleado });
      return id;
    }

    const data: Omit<Empleado, 'id'> = {
      ...this.normalizeEmpleadoDoc(empleado, empresaId),
      ownerId: empleado.ownerId,
      // extra fields
      pagoHoraBruta: empleado.pagoHoraBruta,
      diaContratacion: empleado.diaContratacion,
      paganAguinaldo: empleado.paganAguinaldo,
      cantidadHorasTrabaja: empleado.cantidadHorasTrabaja,
      danReciboPago: empleado.danReciboPago,
      contratoFisico: empleado.contratoFisico,
      espacioComida: empleado.espacioComida,
      brindanVacaciones: empleado.brindanVacaciones,
      incluidoCCSS: empleado.incluidoCCSS,
      incluidoINS: empleado.incluidoINS,
      preguntasExtra: empleado.preguntasExtra,
    };

    await FirestoreService.addWithId(this.COLLECTION_NAME, id, data);
    // Invalidate cache for this empresa
    this.clearCache(empresaId);
    return id;
  }

  static async updateEmpleado(id: string, patch: Partial<Empleado>): Promise<void> {
    const docId = String(id || '').trim();
    if (!docId) throw new Error('id es requerido para actualizar un empleado');

    const updateData: Partial<Empleado> = {
      ...patch,
      updatedAt: new Date(),
    };

    // Normalizar mínimos
    if (updateData.Empleado !== undefined) {
      updateData.Empleado = String(updateData.Empleado || '').trim();
    }
    if (updateData.ccssType !== undefined) {
      const raw = String(updateData.ccssType || '').trim();
      updateData.ccssType = (raw === 'MT' || raw === 'PH' || raw === 'TC') ? (raw as 'TC' | 'MT' | 'PH') : 'TC';
    }

    await FirestoreService.update(this.COLLECTION_NAME, docId, updateData);
    // Invalidate cache - clear all since we don't have empresaId in patch
    if (patch.empresaId) {
      this.clearCache(patch.empresaId);
    } else {
      this.clearCache(); // Clear all if empresaId not available
    }
  }

  static async deleteEmpleado(id: string, empresaId?: string): Promise<void> {
    const docId = String(id || '').trim();
    if (!docId) return;
    await FirestoreService.delete(this.COLLECTION_NAME, docId);
    // Invalidate cache
    if (empresaId) {
      this.clearCache(empresaId);
    } else {
      this.clearCache();
    }
  }
}
