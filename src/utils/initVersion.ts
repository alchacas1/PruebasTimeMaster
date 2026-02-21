import { db } from '@/config/firebase';
import { doc, setDoc } from 'firebase/firestore';
import versionData from '../data/version.json';

/**
 * Inicializa el documento de versión en Firestore
 * Esta función solo necesita ejecutarse una vez para crear el documento inicial
 */
export const initVersionInFirestore = async () => {
  try {
    const versionRef = doc(db, 'version', 'current');
    await setDoc(versionRef, {
      version: versionData.version,
      updatedAt: new Date().toISOString(),
      description: 'Versión actual de la aplicación'
    });
    console.log('✅ Versión inicializada en Firestore:', versionData.version);
    return { success: true, version: versionData.version };
  } catch (error) {
    console.error('❌ Error inicializando versión en Firestore:', error);
    return { success: false, error };
  }
};

/**
 * Actualiza la versión en Firestore
 * Usar esta función cuando se despliegue una nueva versión
 */
export const updateVersionInFirestore = async (newVersion: string) => {
  try {
    const versionRef = doc(db, 'version', 'current');
    await setDoc(versionRef, {
      version: newVersion,
      updatedAt: new Date().toISOString(),
      description: 'Versión actual de la aplicación'
    });
    console.log('✅ Versión actualizada en Firestore:', newVersion);
    return { success: true, version: newVersion };
  } catch (error) {
    console.error('❌ Error actualizando versión en Firestore:', error);
    return { success: false, error };
  }
};
