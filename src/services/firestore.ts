import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where, orderBy,
  limit,
  getCountFromServer
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export class FirestoreService {
  // Remove undefined values recursively from an object or array
  // This prevents Firestore errors when a field value is undefined
  private static sanitizeForFirestore(value: unknown): unknown {
    if (value === null) return null;
    // Preserve Date objects (and other objects that should not be traversed)
    if (value instanceof Date) return value;
    if (Array.isArray(value)) {
      return (value as unknown[])
        .map(item => this.sanitizeForFirestore(item))
        .filter(item => item !== undefined);
    }
    if (typeof value === 'object' && value !== null) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === undefined) continue;
        const sanitized = this.sanitizeForFirestore(v);
        if (sanitized !== undefined) out[k] = sanitized as unknown;
      }
      return out;
    }
    return value;
  }
  /**
 * Get all documents from a collection
 */
  static async getAll(collectionName: string, limitCount?: number): Promise<any[]> {
    try {
      const colRef = collection(db, collectionName);
      const querySnapshot = typeof limitCount === 'number' && Number.isFinite(limitCount)
        ? await getDocs(query(colRef, limit(Math.max(1, Math.trunc(limitCount)))))
        : await getDocs(colRef);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error(`Error getting documents from ${collectionName}:`, error);
      throw error;
    }
  }
  /**
   * Get a single document by ID
   */
  static async getById(collectionName: string, id: string): Promise<any | null> {
    try {
      const docRef = doc(db, collectionName, id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        };
      } else {
        return null;
      }
    } catch (error) {
      console.error(`Error getting document ${id} from ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Add a new document to a collection
   */
  static async add(collectionName: string, data: any): Promise<string> {
    try {
      const safeData = this.sanitizeForFirestore(data) as Record<string, unknown>;
      // Allow passing through sanitized record to Firestore SDK; safeData is validated above
      const docRef = await addDoc(collection(db, collectionName), safeData as any);
      return docRef.id;
    } catch (error) {
      console.error(`Error adding document to ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Add a new document with a specific ID to a collection
   */
  static async addWithId(collectionName: string, id: string, data: any): Promise<void> {
    try {
      const docRef = doc(db, collectionName, id);
      const safeData = this.sanitizeForFirestore(data) as Record<string, unknown>;
      await setDoc(docRef, safeData as any);
    } catch (error) {
      console.error(`Error adding document ${id} to ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Update a document by ID
  */
  static async update(collectionName: string, id: string, data: any): Promise<void> {
    try {
      const docRef = doc(db, collectionName, id);
      const safeData = this.sanitizeForFirestore(data) as Record<string, unknown>;
      await updateDoc(docRef, safeData as any);
    } catch (error) {
      console.error(`Error updating document ${id} in ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Delete a document by ID
   */
  static async delete(collectionName: string, id: string): Promise<void> {
    try {
      const docRef = doc(db, collectionName, id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error(`Error deleting document ${id} from ${collectionName}:`, error);
      throw error;
    }
  }  /**
   * Query documents with conditions
   */
  static async query(
    collectionName: string,
    conditions: Array<{ field: string; operator: any; value: any }> = [],
    orderByField?: string,
    orderDirection: 'asc' | 'desc' = 'asc',
    limitCount?: number
  ): Promise<any[]> {
    try {
      // eslint-disable-next-line prefer-const
      let q = collection(db, collectionName);

      // Apply where conditions
      const constraints = [];
      conditions.forEach(condition => {
        constraints.push(where(condition.field, condition.operator, condition.value));
      });

      // Apply order by
      if (orderByField) {
        constraints.push(orderBy(orderByField, orderDirection));
      }

      // Apply limit
      if (limitCount) {
        constraints.push(limit(limitCount));
      }

      const queryRef = query(q, ...constraints);
      const querySnapshot = await getDocs(queryRef);

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error(`Error querying ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Check if a document exists
   */
  static async exists(collectionName: string, id: string): Promise<boolean> {
    try {
      const docRef = doc(db, collectionName, id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists();
    } catch (error) {
      console.error(`Error checking if document ${id} exists in ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Get documents count in a collection
   */
  static async count(collectionName: string): Promise<number> {
    try {
      const snapshot = await getCountFromServer(collection(db, collectionName));
      return snapshot.data().count;
    } catch (error) {
      console.error(`Error counting documents in ${collectionName}:`, error);
      throw error;
    }
  }
}
