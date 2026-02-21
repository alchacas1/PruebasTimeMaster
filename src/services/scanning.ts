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
import { ref, listAll, deleteObject, getDownloadURL, getMetadata } from 'firebase/storage';
import { db, storage } from '@/config/firebase';
import type { ScanResult } from '../types/firestore';

export type { ScanResult } from '../types/firestore';

// Cache para evitar consultas repetidas
class ScanningCache {
    private static scansCache: ScanResult[] | null = null;
    private static scansCacheTime: number = 0;
    private static readonly CACHE_DURATION = 30000; // 30 segundos

    private static imageStatusCache = new Map<string, boolean>();
    private static imageListCache: string[] | null = null;
    private static imageListCacheTime: number = 0;

    static getCachedScans(): ScanResult[] | null {
        if (this.scansCache && Date.now() - this.scansCacheTime < this.CACHE_DURATION) {
            return this.scansCache;
        }
        return null;
    }

    static setCachedScans(scans: ScanResult[]): void {
        this.scansCache = scans;
        this.scansCacheTime = Date.now();
    }

    static invalidateScansCache(): void {
        this.scansCache = null;
        this.scansCacheTime = 0;
    }

    static getImageStatus(code: string): boolean | null {
        return this.imageStatusCache.get(code) ?? null;
    }

    static setImageStatus(code: string, hasImages: boolean): void {
        this.imageStatusCache.set(code, hasImages);
    }

    static getCachedImageList(): string[] | null {
        if (this.imageListCache && Date.now() - this.imageListCacheTime < this.CACHE_DURATION) {
            return this.imageListCache;
        }
        return null;
    }

    static setCachedImageList(images: string[]): void {
        this.imageListCache = images;
        this.imageListCacheTime = Date.now();
    }

    static invalidateImageCache(): void {
        this.imageListCache = null;
        this.imageListCacheTime = 0;
        this.imageStatusCache.clear();
    }
}

export class ScanningService {
    private static readonly COLLECTION_NAME = 'scans';

    /**
     * Get how many images exist for a code (uses cached filename list)
     */
    static async getImageCountForCode(code: string): Promise<number> {
        const trimmed = code?.trim();
        if (!trimmed) return 0;

        try {
            const filenames = await this.getAllImageFilenames();
            return filenames.filter((name) => name.startsWith(trimmed)).length;
        } catch {
            return 0;
        }
    }

    /**
     * Add a new scan result (optimized)
     */
    static async addScan(scan: Omit<ScanResult, 'id' | 'timestamp'>): Promise<string> {
        try {
            const scanWithTimestamp = {
                ...scan,
                timestamp: new Date(),
                processed: false
            };

            const docRef = await addDoc(collection(db, this.COLLECTION_NAME), scanWithTimestamp);

            // Invalidar caché para que se recargue con el nuevo scan
            ScanningCache.invalidateScansCache();

            return docRef.id;
        } catch (error) {
            console.error('Error adding scan:', error);
            throw error;
        }
    }

    /**
     * Get all scan results with optimized caching
     */
    static async getAllScans(): Promise<ScanResult[]> {
        try {
            // Primero intentar usar caché
            const cachedScans = ScanningCache.getCachedScans();
            if (cachedScans) {
                return cachedScans;
            }

            const q = query(
                collection(db, this.COLLECTION_NAME),
                orderBy('timestamp', 'desc'),
                limit(100)
            );
            const querySnapshot = await getDocs(q);

            const scans = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate() || new Date()
            } as ScanResult));

            // Guardar en caché
            ScanningCache.setCachedScans(scans);

            return scans;
        } catch (error) {
            console.error('Error getting scans:', error);
            throw error;
        }
    }

    /**
     * Get unprocessed scans for a specific session
     */
    static async getUnprocessedScans(sessionId?: string): Promise<ScanResult[]> {
        try {
            let q = query(
                collection(db, this.COLLECTION_NAME),
                where('processed', '==', false),
                orderBy('timestamp', 'desc'),
                limit(50)
            );

            if (sessionId) {
                q = query(
                    collection(db, this.COLLECTION_NAME),
                    where('processed', '==', false),
                    where('sessionId', '==', sessionId),
                    orderBy('timestamp', 'desc'),
                    limit(50)
                );
            }

            const querySnapshot = await getDocs(q);

            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                timestamp: doc.data().timestamp?.toDate() || new Date()
            } as ScanResult));
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
            const docRef = doc(db, this.COLLECTION_NAME, scanId);
            await updateDoc(docRef, {
                processed: true,
                processedAt: new Date()
            });
        } catch (error) {
            console.error('Error marking scan as processed:', error);
            throw error;
        }
    }

    /**
     * Get all image filenames from Storage (optimized with cache)
     */
    private static async getAllImageFilenames(): Promise<string[]> {
        try {
            // Intentar usar caché primero
            const cachedList = ScanningCache.getCachedImageList();
            if (cachedList) {
                return cachedList;
            }

            // Si no hay caché, hacer una sola consulta a Storage
            const storageRef = ref(storage, 'barcode-images/');
            const result = await listAll(storageRef);

            const filenames = result.items.map(item => item.name);

            // Guardar en caché
            ScanningCache.setCachedImageList(filenames);

            return filenames;
        } catch (error) {
            console.error('Error getting image filenames:', error);
            return [];
        }
    }

    /**
     * Check if multiple codes have images (batch operation)
     */
    static async checkMultipleCodesHaveImages(codes: string[]): Promise<Map<string, boolean>> {
        try {
            const result = new Map<string, boolean>();

            // Primero verificar caché
            const uncachedCodes: string[] = [];
            for (const code of codes) {
                const cached = ScanningCache.getImageStatus(code);
                if (cached !== null) {
                    result.set(code, cached);
                } else {
                    uncachedCodes.push(code);
                }
            }

            // Si todos están en caché, retornar inmediatamente
            if (uncachedCodes.length === 0) {
                return result;
            }

            // Una sola consulta para obtener todos los nombres de archivo
            const allFilenames = await this.getAllImageFilenames();

            // Verificar cada código no cacheado
            for (const code of uncachedCodes) {
                const hasImages = allFilenames.some(fileName => {
                    return fileName === `${code}.jpg` ||
                        fileName.match(new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\(\\d+\\)\\.jpg$`));
                });

                result.set(code, hasImages);
                ScanningCache.setImageStatus(code, hasImages);
            }

            return result;
        } catch (error) {
            console.error('Error checking multiple codes for images:', error);
            // En caso de error, asumir que no tienen imágenes
            const result = new Map<string, boolean>();
            codes.forEach(code => result.set(code, false));
            return result;
        }
    }

    /**
     * Check if a single code has images (uses batch method internally)
     */
    static async checkCodeHasImages(code: string): Promise<boolean> {
        const result = await this.checkMultipleCodesHaveImages([code]);
        return result.get(code) ?? false;
    }
    /**
     * Delete images associated with a barcode from Firebase Storage (optimized)
     */
    static async deleteAssociatedImages(barcodeCode: string): Promise<number> {
        try {
            // Usar la lista cacheada si está disponible
            const allFilenames = await this.getAllImageFilenames();

            // Filtrar archivos que coinciden con el patrón del código
            const matchingFilenames = allFilenames.filter(fileName => {
                return fileName === `${barcodeCode}.jpg` ||
                    fileName.match(new RegExp(`^${barcodeCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\(\\d+\\)\\.jpg$`));
            });

            // Eliminar archivos coincidentes
            const deletePromises = matchingFilenames.map(async (fileName) => {
                try {
                    const fileRef = ref(storage, `barcode-images/${fileName}`);
                    await deleteObject(fileRef);
                } catch (error) {
                    console.error(`Error deleting image ${fileName}:`, error);
                    throw error;
                }
            });

            await Promise.all(deletePromises);

            // Invalidar caché después de eliminar
            ScanningCache.invalidateImageCache();

          
            return matchingFilenames.length;
        } catch (error) {
            console.error('Error deleting associated images:', error);
            throw error;
        }
    }

    /**
     * Delete a scan (optimized)
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
            await deleteDoc(doc(db, this.COLLECTION_NAME, scanId));

            // Invalidar caché de scans
            ScanningCache.invalidateScansCache();

            // Delete associated images from Firebase Storage
            try {
                const deletedImagesCount = await this.deleteAssociatedImages(barcodeCode);
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
     * Clear all processed scans older than specified days
     */
    static async cleanupOldScans(daysOld: number = 7): Promise<number> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const q = query(
                collection(db, this.COLLECTION_NAME),
                where('processed', '==', true),
                where('timestamp', '<', cutoffDate)
            );

            const querySnapshot = await getDocs(q);

            const deletePromises = querySnapshot.docs.map(doc =>
                deleteDoc(doc.ref)
            );

            await Promise.all(deletePromises);
            return querySnapshot.docs.length;
        } catch (error) {
            console.error('Error cleaning up old scans:', error);
            throw error;
        }
    }

    /**
     * Listen to real-time changes in scans
     */
    static subscribeToScans(
        callback: (scans: ScanResult[]) => void,
        onError?: (error: Error) => void,
        sessionId?: string
    ): () => void {
        try {
            let q = query(
                collection(db, this.COLLECTION_NAME),
                where('processed', '==', false),
                orderBy('timestamp', 'desc'),
                limit(50)
            );

            if (sessionId) {
                q = query(
                    collection(db, this.COLLECTION_NAME),
                    where('processed', '==', false),
                    where('sessionId', '==', sessionId),
                    orderBy('timestamp', 'desc'),
                    limit(50)
                );
            }

            const unsubscribe = onSnapshot(
                q,
                (querySnapshot) => {
                    const scans: ScanResult[] = querySnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data(),
                        timestamp: doc.data().timestamp?.toDate() || new Date()
                    } as ScanResult));

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
     * Get images for a specific barcode (optimized)
     */
    static async getImagesForCode(barcodeCode: string): Promise<string[]> {
        try {
            // Usar la lista cacheada para filtrar
            const allFilenames = await this.getAllImageFilenames();

            const matchingFilenames = allFilenames.filter(fileName => {
                return fileName === `${barcodeCode}.jpg` ||
                    fileName.match(new RegExp(`^${barcodeCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\(\\d+\\)\\.jpg$`));
            });

            // Convertir a URLs de descarga
            const imageUrls = await Promise.all(
                matchingFilenames.map(async (fileName) => {
                    try {
                        const fileRef = ref(storage, `barcode-images/${fileName}`);
                        return await getDownloadURL(fileRef);
                    } catch (error) {
                        console.error(`Error getting download URL for ${fileName}:`, error);
                        return null;
                    }
                })
            );

            // Filtrar URLs válidas
            return imageUrls.filter((url): url is string => url !== null);
        } catch (error) {
            console.error('Error getting images for code:', error);
            return [];
        }
    }

    /**
     * Try to read a `codeBU` from customMetadata of the first matching image for a barcode.
     * Returns null if not found.
     */
    static async getCodeBUForCode(barcodeCode: string): Promise<string | null> {
        try {
            // Use cached file list and find the first match
            const allFilenames = await this.getAllImageFilenames();
            const match = allFilenames.find(fileName =>
                fileName === `${barcodeCode}.jpg` ||
                !!fileName.match(new RegExp(`^${barcodeCode.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\(\\d+\\)\\.jpg$`))
            );
            if (!match) return null;

            const fileRef = ref(storage, `barcode-images/${match}`);
            const meta = await getMetadata(fileRef);
            const codeBU = (meta.customMetadata && (meta.customMetadata as Record<string, string>).codeBU) || null;
            return codeBU || null;
        } catch (error) {
            console.warn('getCodeBUForCode: unable to read metadata', error);
            return null;
        }
    }

    /**
     * Force refresh cache (para usar cuando sepas que los datos han cambiado)
     */
    static forceRefreshCache(): void {
        ScanningCache.invalidateScansCache();
        ScanningCache.invalidateImageCache();
    }

    /**
     * Generate a unique session ID for grouping scans (short format)
     */
    static generateSessionId(): string {
        // Generate a short session ID: timestamp base36 + random string
        const timestamp = Date.now().toString(36); // Much shorter than decimal
        const random = Math.random().toString(36).substr(2, 6); // 6 chars instead of 9
        return `${timestamp}${random}`;
    }
}
