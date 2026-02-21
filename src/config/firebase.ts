import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Configuración de Firebase con fallbacks para producción
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "your-api-key-here",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "your-project.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://your-project-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "your-project-id",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "your-project.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:abcdef123456789"
};

// Validar que la configuración no esté vacía
const isConfigValid = Object.values(firebaseConfig).every(value =>
  value && !value.includes('your-') && !value.includes('123456789')
);

if (!isConfigValid) {
  console.warn('⚠️ Firebase configuration contains placeholder values. Please update .env.local with your actual Firebase config.');
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
// - In browser: enable persistent cache so offline writes survive reloads (common cause of "I saved it and tomorrow it's gone").
// - In SSR / environments without IndexedDB: fallback to default (in-memory).
// Optional override (production only): set NEXT_PUBLIC_FIRESTORE_DATABASE_ID to target a named Firestore database.
// In development we ALWAYS use the default Firestore database (no databaseId), even if the env var is set.
// This prevents local `.env.local` overrides from accidentally pointing dev to a non-default database.
// To make production robust, default to "restauracion" when NODE_ENV === 'production'.
const firestoreDatabaseIdRaw = (process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID || '').trim();
const isProduction = process.env.NODE_ENV === 'production';
const firestoreDatabaseId = isProduction ? (firestoreDatabaseIdRaw || 'restauracion') : '';

if (!isProduction && firestoreDatabaseIdRaw) {
  console.warn(
    '⚠️ NEXT_PUBLIC_FIRESTORE_DATABASE_ID is set but will be ignored in development. Using the default Firestore database.'
  );
}

export const db = (() => {
  const isBrowser = typeof window !== 'undefined';
  if (!isBrowser) {
    return firestoreDatabaseId ? getFirestore(app, firestoreDatabaseId) : getFirestore(app);
  }

  try {
    const settings = {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    };

    return firestoreDatabaseId
      ? initializeFirestore(app, settings, firestoreDatabaseId)
      : initializeFirestore(app, settings);
  } catch (err) {
    console.warn('⚠️ Firestore persistent cache unavailable; falling back to memory cache.', err);
    const settings = {
      localCache: memoryLocalCache(),
    };

    return firestoreDatabaseId
      ? initializeFirestore(app, settings, firestoreDatabaseId)
      : initializeFirestore(app, settings);
  }
})();

// Initialize Storage
export const storage = getStorage(app);

export default app;
