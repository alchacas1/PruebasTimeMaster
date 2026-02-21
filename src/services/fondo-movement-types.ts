import { FirestoreService } from './firestore';
import { FondoMovementTypeConfig } from '../types/firestore';
import { db } from '@/config/firebase';
import { collection, onSnapshot, query, orderBy, Unsubscribe } from 'firebase/firestore';

// Keys para localStorage
const CACHE_KEY = 'fondoMovementTypes_cache';
const CACHE_VERSION_KEY = 'fondoMovementTypes_version';

// Listener global para detectar cambios en tiempo real
let globalListener: Unsubscribe | null = null;
let cacheVersion = 0;

export class FondoMovementTypesService {
  private static readonly COLLECTION_NAME = 'fondoMovementTypes';

  /**
   * Get all movement types
   */
  static async getAllMovementTypes(): Promise<FondoMovementTypeConfig[]> {
    const types = await FirestoreService.getAll(this.COLLECTION_NAME);
    return types.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  /**
   * Get movement types by category
   */
  static async getMovementTypesByCategory(category: 'INGRESO' | 'GASTO' | 'EGRESO'): Promise<FondoMovementTypeConfig[]> {
    const allTypes = await this.getAllMovementTypes();
    return allTypes.filter(type => type.category === category);
  }

  /**
   * Get movement type by ID
   */
  static async getMovementTypeById(id: string): Promise<FondoMovementTypeConfig | null> {
    return await FirestoreService.getById(this.COLLECTION_NAME, id);
  }

  /**
   * Add a new movement type
   */
  static async addMovementType(type: Omit<FondoMovementTypeConfig, 'id'>): Promise<string> {
    const typeWithDates = {
      ...type,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return await FirestoreService.add(this.COLLECTION_NAME, typeWithDates);
  }

  /**
   * Update a movement type
   */
  static async updateMovementType(id: string, type: Partial<FondoMovementTypeConfig>): Promise<void> {
    const updateData = {
      ...type,
      updatedAt: new Date(),
    };
    return await FirestoreService.update(this.COLLECTION_NAME, id, updateData);
  }

  /**
   * Delete a movement type
   */
  static async deleteMovementType(id: string): Promise<void> {
    return await FirestoreService.delete(this.COLLECTION_NAME, id);
  }

  /**
   * Seed initial data from hardcoded constants
   */
  static async seedInitialData(): Promise<void> {
    const existing = await this.getAllMovementTypes();
    if (existing.length > 0) {
      console.log('Movement types already exist, skipping seed');
      return;
    }

    const FONDO_INGRESO_TYPES = ['VENTAS', 'OTROS INGRESOS'];
    const FONDO_GASTO_TYPES = [
      'SALARIOS',
      'TELEFONOS',
      'CARGAS SOCIALES',
      'AGUINALDOS',
      'VACACIONES',
      'POLIZA RIESGOS DE TRABAJO',
      'PAGO TIMBRE Y EDUCACION',
      'PAGO IMPUESTOS A SOCIEDADES',
      'PATENTES MUNICIPALES',
      'ALQUILER LOCAL',
      'ELECTRICIDAD',
      'AGUA',
      'INTERNET',
      'MANTENIMIENTO INSTALACIONES',
      'PAPELERIA Y UTILES',
      'ASEO Y LIMPIEZA',
      'REDES SOCIALES',
      'MATERIALES DE EMPAQUE',
      'CONTROL PLAGAS',
      'MONITOREO DE ALARMAS',
      'FACTURA ELECTRONICA',
      'GASTOS VARIOS',
      'TRANSPORTE',
      'SERVICIOS PROFECIONALES',
      'MANTENIMIENTO MOBILIARIO Y EQUIPO',
    ];
    const FONDO_EGRESO_TYPES = [
      'EGRESOS VARIOS',
      'PAGO TIEMPOS',
      'PAGO BANCA',
      'COMPRA INVENTARIO',
      'COMPRA ACTIVOS',
      'PAGO IMPUESTO RENTA',
      'PAGO IMPUESTO IVA',
      'RETIRO EFECTIVO'
    ];

    const allTypes: Omit<FondoMovementTypeConfig, 'id'>[] = [];
    
    let order = 0;
    FONDO_INGRESO_TYPES.forEach(name => {
      allTypes.push({ category: 'INGRESO', name, order: order++ });
    });
    
    FONDO_GASTO_TYPES.forEach(name => {
      allTypes.push({ category: 'GASTO', name, order: order++ });
    });
    
    FONDO_EGRESO_TYPES.forEach(name => {
      allTypes.push({ category: 'EGRESO', name, order: order++ });
    });

    for (const type of allTypes) {
      await this.addMovementType(type);
    }

    console.log('Movement types seeded successfully');
  }

  /**
   * Get all movement type names grouped by category
   */
  static async getMovementTypesByCategories(): Promise<{
    INGRESO: string[];
    GASTO: string[];
    EGRESO: string[];
  }> {
    const allTypes = await this.getAllMovementTypes();
    return {
      INGRESO: allTypes.filter(t => t.category === 'INGRESO').map(t => t.name),
      GASTO: allTypes.filter(t => t.category === 'GASTO').map(t => t.name),
      EGRESO: allTypes.filter(t => t.category === 'EGRESO').map(t => t.name),
    };
  }

  /**
   * Lee los tipos desde el caché de localStorage
   */
  private static readCache(): FondoMovementTypeConfig[] | null {
    if (typeof window === 'undefined') return null;
    
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      const version = localStorage.getItem(CACHE_VERSION_KEY);
      
      if (cached && version) {
        cacheVersion = parseInt(version, 10) || 0;
        return JSON.parse(cached) as FondoMovementTypeConfig[];
      }
    } catch (error) {
      console.warn('[FondoMovementTypes] Error reading cache:', error);
    }
    
    return null;
  }

  /**
   * Escribe los tipos al caché de localStorage
   */
  private static writeCache(types: FondoMovementTypeConfig[]): void {
    if (typeof window === 'undefined') return;
    
    try {
      cacheVersion++;
      localStorage.setItem(CACHE_KEY, JSON.stringify(types));
      localStorage.setItem(CACHE_VERSION_KEY, cacheVersion.toString());
    } catch (error) {
      console.error('[FondoMovementTypes] Error writing cache:', error);
    }
  }

  /**
   * Inicializa el listener global de Firestore para sincronización en tiempo real
   */
  static initializeListener(): void {
    if (globalListener) {
      console.log('[FondoMovementTypes] Listener already active');
      return;
    }

    console.log('[FondoMovementTypes] Initializing Firestore listener...');
    
    const q = query(
      collection(db, this.COLLECTION_NAME),
      orderBy('order', 'asc')
    );
    
    globalListener = onSnapshot(
      q,
      (snapshot) => {
        console.log('[FondoMovementTypes] Firestore change detected, updating cache...');
        
        const types: FondoMovementTypeConfig[] = [];
        snapshot.forEach((doc) => {
          types.push({ id: doc.id, ...doc.data() } as FondoMovementTypeConfig);
        });
        
        // Actualizar caché
        this.writeCache(types);
        
        // Emitir evento personalizado para notificar a los componentes
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('fondoMovementTypesUpdated', {
              detail: { types, version: cacheVersion }
            })
          );
        }
      },
      (error) => {
        console.error('[FondoMovementTypes] Listener error:', error);
      }
    );
  }

  /**
   * Detiene el listener global
   */
  static stopListener(): void {
    if (globalListener) {
      console.log('[FondoMovementTypes] Stopping listener...');
      globalListener();
      globalListener = null;
    }
  }

  /**
   * Obtiene los tipos desde el caché o la base de datos
   * Esta es la función principal que deben usar los componentes
   */
  static async getTypesFromCacheOrDB(): Promise<FondoMovementTypeConfig[]> {
    // Inicializar listener si no está activo
    this.initializeListener();

    // Intentar obtener del caché primero
    const cached = this.readCache();
    if (cached) {
      console.log('[FondoMovementTypes] Loaded from cache');
      return cached;
    }

    // Si no hay caché, obtener de la base de datos
    console.log('[FondoMovementTypes] Cache miss, fetching from Firestore...');
    const types = await this.getAllMovementTypes();
    
    // Guardar en caché
    this.writeCache(types);
    
    return types;
  }

  /**
   * Obtiene los tipos agrupados por categoría (con caché)
   */
  static async getMovementTypesByCategoriesWithCache(): Promise<{
    INGRESO: string[];
    GASTO: string[];
    EGRESO: string[];
  }> {
    const types = await this.getTypesFromCacheOrDB();
    
    return {
      INGRESO: types.filter(t => t.category === 'INGRESO').map(t => t.name),
      GASTO: types.filter(t => t.category === 'GASTO').map(t => t.name),
      EGRESO: types.filter(t => t.category === 'EGRESO').map(t => t.name),
    };
  }

  /**
   * Limpia el caché manualmente (útil para debugging)
   */
  static clearCache(): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_VERSION_KEY);
      cacheVersion = 0;
      console.log('[FondoMovementTypes] Cache cleared');
    } catch (error) {
      console.error('[FondoMovementTypes] Error clearing cache:', error);
    }
  }

  /**
   * Obtiene la versión actual del caché
   */
  static getCacheVersion(): number {
    return cacheVersion;
  }
}
