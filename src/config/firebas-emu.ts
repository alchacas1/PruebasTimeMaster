import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  connectFirestoreEmulator // Siempre necesario para el emulador
} from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

// Configuración mínima, solo necesitamos el projectId que usa el emulador por defecto
const firebaseConfig = {
  projectId: "alchacas-db", 
  // Puedes dejar los demás campos con valores falsos o quitarlos si no se usan
};

// 1. Inicializar App
const app = initializeApp(firebaseConfig);

// 2. Definir que NO usaremos bases de datos con nombre, siempre la (default) del emulador
const firestoreDatabaseId = '';

// 3. Configurar Firestore
export const db = (() => {
  const isBrowser = typeof window !== 'undefined';
  let instance;

  // Usamos caché en memoria por simplicidad cuando solo usamos el emulador local
  const settings = { localCache: memoryLocalCache() };

  if (!isBrowser) {
    instance = firestoreDatabaseId ? getFirestore(app, firestoreDatabaseId) : getFirestore(app);
  } else {
    instance = firestoreDatabaseId 
      ? initializeFirestore(app, settings, firestoreDatabaseId)
      : initializeFirestore(app, settings);
  }

  // --- CONEXIÓN FORZADA AL EMULADOR DE FIRESTORE ---
  // Ejecutamos la conexión incondicionalmente
  connectFirestoreEmulator(instance, '127.0.0.1', 8080);
  console.log("📡 Conexión forzada: Usando solo el Emulador Local (Puerto 8080)");

  return instance;
})();

// 4. Configurar Storage para el emulador (Forzado)
export const storage = (() => {
  const s = getStorage(app);
  
  // --- CONEXIÓN FORZADA AL EMULADOR DE STORAGE ---
  connectStorageEmulator(s, '127.0.0.1', 9199);
  
  return s;
})();

export default app;
