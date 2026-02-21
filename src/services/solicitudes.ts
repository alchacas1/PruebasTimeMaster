import { FirestoreService } from './firestore';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '@/config/firebase';

export class SolicitudesService {
  private static readonly COLLECTION_NAME = 'solicitudes';

  /**
   * Delete multiple solicitudes by IDs efficiently (chunks to respect Firestore batch limits).
   */
  static async deleteSolicitudesByIds(ids: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
    if (uniqueIds.length === 0) return;

    // Firestore writeBatch supports up to 500 ops; keep a safety margin.
    const CHUNK_SIZE = 450;
    for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
      const slice = uniqueIds.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const id of slice) {
        batch.delete(doc(db, this.COLLECTION_NAME, id));
      }
      await batch.commit();
    }
  }

  /**
   * Create a new solicitud document. The service will add the creation date automatically.
   */
  static async addSolicitud(payload: { productName: string; empresa: string }): Promise<string> {
    const doc = {
      productName: payload.productName,
      empresa: payload.empresa,
      createdAt: new Date(),
      listo: false,
    };

    return await FirestoreService.add(this.COLLECTION_NAME, doc);
  }

  /**
   * Update a solicitud document by id with partial data
   */
  static async updateSolicitud(id: string, data: Partial<Record<string, any>>): Promise<void> {
    try {
      await FirestoreService.update(this.COLLECTION_NAME, id, data);
    } catch (err) {
      console.error('Error updating solicitud', id, err);
      throw err;
    }
  }

  /**
   * Convenience to set the 'listo' flag
   */
  static async setListo(id: string, listo: boolean): Promise<void> {
    return await this.updateSolicitud(id, { listo });
  }

  /**
   * Get all solicitudes ordered by newest first
   */
  static async getAllSolicitudes(): Promise<any[]> {
    // Use query helper to order by createdAt desc
    try {
      const rows = await FirestoreService.query(this.COLLECTION_NAME, [], 'createdAt', 'desc');
      return rows;
    } catch (err) {
      console.error('Error fetching solicitudes:', err);
      return [];
    }
  }

  /**
   * Get solicitudes filtered by empresa (company name)
   */
  static async getSolicitudesByEmpresa(empresa: string, limitCount?: number): Promise<any[]> {
    if (!empresa) return [];
    try {
      const conditions = [
        { field: 'empresa', operator: '==', value: empresa }
      ];
      const rows = await FirestoreService.query(this.COLLECTION_NAME, conditions, 'createdAt', 'desc', limitCount);
      if (rows && rows.length > 0) return rows;

      // In production, avoid expensive fallbacks that read the entire collection.
      // These fallbacks were intended for dev/debugging when company names are inconsistent.
      if (process.env.NODE_ENV === 'production') {
        return [];
      }

      // If no rows found, fallback: fetch all and perform a normalized client-side match.
      // This handles differences in casing, extra spaces, or small variants in stored company names.
      const all = await FirestoreService.getAll(this.COLLECTION_NAME);
      const normalize = (s: any) => (s || '')
        .toString()
        .normalize('NFKD')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

      const target = normalize(empresa);
      const exact = all.filter(r => normalize(r.empresa) === target);
      if (exact.length > 0) {
        // sort by createdAt desc
        return exact.sort((a, b) => {
          const dateA = a?.createdAt ? (a.createdAt.seconds ? new Date(a.createdAt.seconds * 1000) : new Date(a.createdAt)) : new Date(0);
          const dateB = b?.createdAt ? (b.createdAt.seconds ? new Date(b.createdAt.seconds * 1000) : new Date(b.createdAt)) : new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
      }

      // Fallback partial match (contains)
      const partial = all.filter(r => normalize(r.empresa).includes(target));
      if (partial.length > 0) {
        return partial.sort((a, b) => {
          const dateA = a?.createdAt ? (a.createdAt.seconds ? new Date(a.createdAt.seconds * 1000) : new Date(a.createdAt)) : new Date(0);
          const dateB = b?.createdAt ? (b.createdAt.seconds ? new Date(b.createdAt.seconds * 1000) : new Date(b.createdAt)) : new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
      }

      return [];
    } catch (err) {
      console.error('Error fetching solicitudes for empresa', empresa, err);
      return [];
    }
  }

  /**
   * Delete a solicitud by id
   */
  static async deleteSolicitud(id: string): Promise<void> {
    return await FirestoreService.delete(this.COLLECTION_NAME, id);
  }
}
