import {
    collection,
    doc,
    addDoc,
    getDocs,
    deleteDoc,
    updateDoc,
    query,
    orderBy,
    where,
    onSnapshot,
    serverTimestamp,
    Timestamp
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export interface SessionStatus {
    id: string;
    sessionId: string;
    source: 'pc' | 'mobile';
    status: 'active' | 'inactive';
    lastSeen: Date;
    userAgent?: string;
    userId?: string;
    userName?: string;
}

export class SessionSyncService {
    private static readonly COLLECTION_NAME = 'session_status';
    private static readonly HEARTBEAT_INTERVAL = 5000; // 5 segundos
    private static readonly TIMEOUT_THRESHOLD = 15000; // 15 segundos

    /**
     * Registrar una sesión activa
     */
    static async registerSession(
        sessionId: string,
        source: 'pc' | 'mobile',
        userId?: string,
        userName?: string): Promise<string> {
        try {
            const sessionData: Record<string, unknown> = {
                sessionId,
                source,
                status: 'active' as const,
                lastSeen: serverTimestamp(),
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined
            };

            // Solo incluir userId y userName si no son undefined
            if (userId !== undefined) {
                sessionData.userId = userId;
            }
            if (userName !== undefined) {
                sessionData.userName = userName;
            }

            const docRef = await addDoc(collection(db, this.COLLECTION_NAME), sessionData);
            return docRef.id;
        } catch (error) {
            console.error('Error registering session:', error);
            throw error;
        }
    }

    /**
     * Actualizar heartbeat de una sesión
     */
    static async updateHeartbeat(sessionDocId: string): Promise<void> {
        try {
            const docRef = doc(db, this.COLLECTION_NAME, sessionDocId);
            await updateDoc(docRef, {
                lastSeen: serverTimestamp(),
                status: 'active'
            });
        } catch (error) {
            console.error('Error updating heartbeat:', error);
            throw error;
        }
    }    /**
     * Marcar sesión como inactiva (elimina el documento)
     */
    static async markSessionInactive(sessionDocId: string): Promise<void> {
        try {
            const docRef = doc(db, this.COLLECTION_NAME, sessionDocId);
            await deleteDoc(docRef);
        } catch (error) {
            console.error('Error deleting inactive session:', error);
            throw error;
        }
    }

    /**
     * Obtener sesiones activas para un sessionId
     */
    static async getActiveSessions(sessionId: string): Promise<SessionStatus[]> {
        try {
            const fifteenSecondsAgo = new Date(Date.now() - this.TIMEOUT_THRESHOLD);

            const q = query(
                collection(db, this.COLLECTION_NAME),
                where('sessionId', '==', sessionId),
                where('lastSeen', '>', Timestamp.fromDate(fifteenSecondsAgo)),
                orderBy('lastSeen', 'desc')
            );

            const querySnapshot = await getDocs(q);

            return querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                lastSeen: doc.data().lastSeen?.toDate() || new Date()
            } as SessionStatus));
        } catch (error) {
            console.error('Error getting active sessions:', error);
            throw error;
        }
    }

    /**
     * Verificar si hay una conexión móvil activa para la sesión
     */
    static async hasMobileConnection(sessionId: string): Promise<boolean> {
        try {
            const activeSessions = await this.getActiveSessions(sessionId);
            return activeSessions.some(session =>
                session.source === 'mobile' &&
                session.status === 'active'
            );
        } catch (error) {
            console.error('Error checking mobile connection:', error);
            return false;
        }
    }

    /**
     * Verificar si hay una conexión PC activa para la sesión
     */
    static async hasPCConnection(sessionId: string): Promise<boolean> {
        try {
            const activeSessions = await this.getActiveSessions(sessionId);
            return activeSessions.some(session =>
                session.source === 'pc' &&
                session.status === 'active'
            );
        } catch (error) {
            console.error('Error checking PC connection:', error);
            return false;
        }
    }

    /**
     * Escuchar cambios en tiempo real de las sesiones
     */
    static subscribeToSessionStatus(
        sessionId: string,
        callback: (sessions: SessionStatus[]) => void,
        onError?: (error: Error) => void
    ): () => void {
        try {
            const fifteenSecondsAgo = new Date(Date.now() - this.TIMEOUT_THRESHOLD);

            const q = query(
                collection(db, this.COLLECTION_NAME),
                where('sessionId', '==', sessionId),
                where('lastSeen', '>', Timestamp.fromDate(fifteenSecondsAgo)),
                orderBy('lastSeen', 'desc')
            );

            const unsubscribe = onSnapshot(
                q,
                (querySnapshot) => {
                    const sessions: SessionStatus[] = querySnapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data(),
                        lastSeen: doc.data().lastSeen?.toDate() || new Date()
                    } as SessionStatus));

                    callback(sessions);
                },
                (error) => {
                    console.error('Error in session status subscription:', error);
                    if (onError) {
                        onError(error as Error);
                    }
                }
            );

            return unsubscribe;
        } catch (error) {
            console.error('Error setting up session status subscription:', error);
            throw error;
        }
    }

    /**
     * Limpiar sesiones inactivas antiguas
     */
    static async cleanupInactiveSessions(hoursOld: number = 24): Promise<number> {
        try {
            const cutoffDate = new Date(Date.now() - (hoursOld * 60 * 60 * 1000));

            const q = query(
                collection(db, this.COLLECTION_NAME),
                where('lastSeen', '<', Timestamp.fromDate(cutoffDate))
            );

            const querySnapshot = await getDocs(q);

            const deletePromises = querySnapshot.docs.map(doc =>
                deleteDoc(doc.ref)
            );

            await Promise.all(deletePromises);
            return querySnapshot.docs.length;
        } catch (error) {
            console.error('Error cleaning up inactive sessions:', error);
            throw error;
        }
    }

    /**
     * Crear un hook para manejar el heartbeat automático
     */
    static createHeartbeatManager(
        sessionId: string,
        source: 'pc' | 'mobile',
        userId?: string,
        userName?: string
    ): {
        start: () => Promise<void>;
        stop: () => void;
        sessionDocId: string | null;
    } {
        let sessionDocId: string | null = null;
        let heartbeatInterval: NodeJS.Timeout | null = null;

        const start = async () => {
            try {
                // Registrar sesión
                sessionDocId = await this.registerSession(sessionId, source, userId, userName);

                // Iniciar heartbeat
                heartbeatInterval = setInterval(async () => {
                    if (sessionDocId) {
                        try {
                            await this.updateHeartbeat(sessionDocId);
                        } catch (error) {
                            console.error('Heartbeat failed:', error);
                        }
                    }
                }, this.HEARTBEAT_INTERVAL);

                // Cleanup al cerrar ventana/página
                if (typeof window !== 'undefined') {
                    window.addEventListener('beforeunload', stop);
                    window.addEventListener('unload', stop);
                }
            } catch (error) {
                console.error('Error starting heartbeat manager:', error);
                throw error;
            }
        };

        const stop = () => {
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            } if (sessionDocId) {
                // Eliminar documento de la sesión de manera asíncrona
                this.markSessionInactive(sessionDocId).catch(console.error);
                sessionDocId = null;
            }

            if (typeof window !== 'undefined') {
                window.removeEventListener('beforeunload', stop);
                window.removeEventListener('unload', stop);
            }
        };

        return { start, stop, sessionDocId };
    }
}
