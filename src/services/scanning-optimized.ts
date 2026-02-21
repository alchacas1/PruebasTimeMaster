import {
  collection,
  doc,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  limit, where,
  onSnapshot,
  getDoc
} from 'firebase/firestore';
import { ref, listAll, deleteObject } from 'firebase/storage';
import { db, storage } from '@/config/firebase';
import type { ScanResult } from '../types/firestore';

export type { ScanResult } from '../types/firestore';

export class ScanningService {
  private static readonly COLLECTION_NAME = 'scans';

  /**
   * Add a new scan result
   */
  static async addScan(scan: Omit<ScanResult, 'id' | 'timestamp'>): Promise<string> {
    try {
      const scanWithTimestamp = {
        ...scan,
        timestamp: new Date(),
        processed: false
      };

      const docRef = await addDoc(collection(db, this.COLLECTION_NAME), scanWithTimestamp);
      return docRef.id;
    } catch (error) {
      console.error('Error adding scan:', error);
      throw error;
    }
  }

  /**
   * Simple method to get scans by sessionId without complex indexes
   */
  static async getScansBySession(sessionId: string): Promise<ScanResult[]> {
    try {
      // Use simple where query without orderBy to avoid index requirements
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('sessionId', '==', sessionId)
      );

      const querySnapshot = await getDocs(q);

      const scans = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date()
      } as ScanResult));

      // Client-side sorting by timestamp (newest first)
      return scans.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      console.error('Error getting scans by session:', error);
      throw error;
    }
  }

  /**
   * Get all scan results (simplified query - no index needed)
   */
  static async getAllScans(): Promise<ScanResult[]> {
    try {
      const q = query(
        collection(db, this.COLLECTION_NAME),
        orderBy('timestamp', 'desc'),
        limit(100)
      );
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date()
      } as ScanResult));
    } catch (error) {
      console.error('Error getting scans:', error);
      throw error;
    }
  }

  /**
   * Get unprocessed scans for a specific session (optimized for index requirements)
   */
  static async getUnprocessedScans(sessionId?: string): Promise<ScanResult[]> {
    try {
      // Simplified query to reduce index requirements
      let q;

      if (sessionId) {
        // For session-specific scans, use sessionId as primary filter
        q = query(
          collection(db, this.COLLECTION_NAME),
          where('sessionId', '==', sessionId),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
      } else {
        // For general unprocessed scans, use processed field only
        q = query(
          collection(db, this.COLLECTION_NAME),
          where('processed', '==', false),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
      }

      const querySnapshot = await getDocs(q);

      let scans = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date()
      } as ScanResult));

      // Client-side filtering for session-specific unprocessed scans
      if (sessionId) {
        scans = scans.filter(scan => !scan.processed);
      }

      return scans;
    } catch (error) {
      console.error('Error getting unprocessed scans:', error);
      throw error;
    }
  }

  /**
   * Mark a scan as processed
   */
  static async markAsProcessed(scanId: string): Promise<void> {
    try {
      const scanRef = doc(db, this.COLLECTION_NAME, scanId);
      await updateDoc(scanRef, {
        processed: true,
        processedAt: new Date()
      });
    } catch (error) {
      console.error('Error marking scan as processed:', error);
      throw error;
    }
  }

  /**
   * Delete images associated with a barcode from Firebase Storage
   */
  static async deleteAssociatedImages(barcodeCode: string): Promise<number> {
    try {
      // Reference to the barcode-images folder
      const storageRef = ref(storage, 'barcode-images/');

      // List all files in the barcode-images folder
      const result = await listAll(storageRef);

      // Filter files that match the barcode pattern
      const matchingFiles = result.items.filter(item => {
        const fileName = item.name;
        // Match exact code name or code with numbers in parentheses
        return fileName === `${barcodeCode}.jpg` ||
          fileName.match(new RegExp(`^${barcodeCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\(\\d+\\)\\.jpg$`));
      });

      // Delete all matching files
      const deletePromises = matchingFiles.map(async (fileRef) => {
        try {
          await deleteObject(fileRef);
          //(`Deleted image: ${fileRef.name}`);
        } catch (error) {
          console.error(`Error deleting image ${fileRef.name}:`, error);
          throw error;
        }
      });

      await Promise.all(deletePromises);

      //(`Deleted ${matchingFiles.length} images for code: ${barcodeCode}`);
      return matchingFiles.length;
    } catch (error) {
      console.error('Error deleting associated images:', error);
      throw error;
    }
  }

  /**
   * Delete a specific scan
   */
  static async deleteScan(scanId: string): Promise<void> {
    try {
      // First, get the scan to obtain the barcode code
      const scanDoc = await getDoc(doc(db, this.COLLECTION_NAME, scanId));

      if (!scanDoc.exists()) {
        throw new Error('Scan not found');
      }

      const scanData = scanDoc.data() as ScanResult;
      const barcodeCode = scanData.code;

      // Delete the scan document from Firestore
      const scanRef = doc(db, this.COLLECTION_NAME, scanId);
      await deleteDoc(scanRef);

      // Delete associated images from Firebase Storage
      try {
        const deletedImagesCount = await this.deleteAssociatedImages(barcodeCode);
        //(`Deleted scan ${scanId} and ${deletedImagesCount} associated images for code: ${barcodeCode}`);
      } catch (imageError) {
        console.warn(`Scan deleted but failed to delete images for code ${barcodeCode}:`, imageError);
        // Don't throw here - the scan was successfully deleted
      }
    } catch (error) {
      console.error('Error deleting scan:', error);
      throw error;
    }
  }

  /**
   * Clean up old processed scans (simplified query)
   */
  static async cleanupOldScans(daysOld: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // Simplified query - get processed scans first, then filter by date
      const q = query(
        collection(db, this.COLLECTION_NAME),
        where('processed', '==', true),
        limit(100) // Process in batches
      );

      const querySnapshot = await getDocs(q);

      // Client-side filtering for date
      const oldScans = querySnapshot.docs.filter(doc => {
        const timestamp = doc.data().timestamp?.toDate() || new Date();
        return timestamp < cutoffDate;
      });

      const deletePromises = oldScans.map(doc =>
        deleteDoc(doc.ref)
      );

      await Promise.all(deletePromises);
      return oldScans.length;
    } catch (error) {
      console.error('Error cleaning up old scans:', error);
      throw error;
    }
  }
  /**
   * Subscribe to real-time scan updates (optimized to avoid complex indexes)
   */
  static subscribeToScans(
    callback: (scans: ScanResult[]) => void,
    sessionId?: string,
    onError?: (error: Error) => void
  ): () => void {
    try {
      let q;

      if (sessionId) {
        // Session-specific subscription - AVOID orderBy to prevent index requirement
        q = query(
          collection(db, this.COLLECTION_NAME),
          where('sessionId', '==', sessionId),
          limit(50)
        );
      } else {
        // General subscription - only order by timestamp
        q = query(
          collection(db, this.COLLECTION_NAME),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
      }

      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          let scans: ScanResult[] = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate() || new Date()
          } as ScanResult));

          // Client-side filtering and sorting when sessionId is provided
          if (sessionId) {
            scans = scans
              .filter(scan => !scan.processed) // Filter unprocessed
              .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()); // Sort by timestamp desc
          }

          callback(scans);
        },
        (error) => {
          console.error('Error in scan subscription:', error);
          if (onError) {
            onError(error as Error);
          }
        }
      );

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up scan subscription:', error);
      throw error;
    }
  }
  /**
   * Get recent scans for a session (optimized to avoid complex indexes)
   */
  static async getRecentScans(sessionId?: string, limit_count: number = 20): Promise<ScanResult[]> {
    try {
      let q;

      if (sessionId) {
        // Session-specific query - AVOID orderBy to prevent index requirement
        q = query(
          collection(db, this.COLLECTION_NAME),
          where('sessionId', '==', sessionId),
          limit(limit_count * 3) // Get more for client-side filtering
        );
      } else {
        // Simple query with minimal index requirements
        q = query(
          collection(db, this.COLLECTION_NAME),
          orderBy('timestamp', 'desc'),
          limit(limit_count * 2)
        );
      }

      const querySnapshot = await getDocs(q);

      let scans = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date()
      } as ScanResult));

      // Client-side filtering and sorting
      if (sessionId) {
        scans = scans
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()) // Sort by timestamp desc
          .slice(0, limit_count); // Take only what we need
      } else {
        scans = scans.slice(0, limit_count);
      }

      return scans;
    } catch (error) {
      console.error('Error getting recent scans:', error);
      throw error;
    }
  }
}
