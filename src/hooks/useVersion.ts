'use client';

import { useState, useEffect } from 'react';
import { db } from '@/config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import versionData from '../data/version.json';

export type ReleaseNote = {
  date: string;
  title: string;
  description: string;
};

// Función para comparar versiones semánticas
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    
    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }
  
  return 0;
}

export function useVersion() {
  const [version, setVersion] = useState<string>(versionData.version);
  const [loading, setLoading] = useState(true);
  const [isLocalNewer, setIsLocalNewer] = useState(false);
  const [dbVersion, setDbVersion] = useState<string | null>(null);

  const releaseNotes =
    (versionData as unknown as { releaseNotes?: ReleaseNote[] }).releaseNotes ??
    [];

  useEffect(() => {
    // Obtener la versión una sola vez al cargar, sin suscripción en tiempo real
    const fetchVersion = async () => {
      try {
        const versionRef = doc(db, 'version', 'current');
        const docSnap = await getDoc(versionRef);
        
        if (docSnap.exists()) {
          const serverVersion = docSnap.data().version;
          setDbVersion(serverVersion);
          
          // Comparar versiones
          const comparison = compareVersions(versionData.version, serverVersion);
          
          if (comparison > 0) {
            // version.json es SUPERIOR - Usar versión local y marcar
            setVersion(versionData.version);
            setIsLocalNewer(true);
          } else {
            // version.json es igual o inferior - Usar versión de Firestore
            setVersion(serverVersion || versionData.version);
            setIsLocalNewer(false);
          }
        } else {
          // Si no existe en la base de datos, usar la versión local
          setVersion(versionData.version);
          setIsLocalNewer(false);
        }
      } catch (error) {
        console.error('Error obteniendo versión:', error);
        // En caso de error, usar la versión local
        setVersion(versionData.version);
        setIsLocalNewer(false);
      } finally {
        setLoading(false);
      }
    };

    fetchVersion();
  }, []); // Solo se ejecuta una vez al montar el componente

  return { version, loading, isLocalNewer, dbVersion, releaseNotes };
}
