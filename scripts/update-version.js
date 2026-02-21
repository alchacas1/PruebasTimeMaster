#!/usr/bin/env node

/**
 * Script para sincronizar la versión entre version.json y Firestore
 * Prioridad: version.json superior actualiza Firestore, si son iguales usa Firestore
 */

let admin;
let fs;
let path;

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

// Función para comparar versiones semánticas
function compareVersions(v1, v2) {
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

async function syncVersion() {
  try {
    const adminModule = await import('firebase-admin');
    admin = adminModule.default ?? adminModule;

    const fsModule = await import('node:fs');
    fs = fsModule.default ?? fsModule;

    const pathModule = await import('node:path');
    path = pathModule.default ?? pathModule;

    console.log(`${colors.blue}🔄 Iniciando sincronización de versión...${colors.reset}\n`);

    // Leer version.json
    const versionPath = path.join(__dirname, '../src/data/version.json');
    const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    const localVersion = versionData.version;

    console.log(`${colors.blue}📦 Versión local (version.json): ${colors.yellow}${localVersion}${colors.reset}`);

    // Inicializar Firebase Admin
    const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
    
    if (!fs.existsSync(serviceAccountPath)) {
      console.error(`${colors.red}❌ Error: No se encontró el archivo serviceAccountKey.json${colors.reset}`);
      console.log(`${colors.yellow}💡 Descarga las credenciales desde Firebase Console > Project Settings > Service Accounts${colors.reset}`);
      process.exit(1);
    }

    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    const db = admin.firestore();
    db.settings({ databaseId: 'restauracion' });

    // Verificar versión actual en Firestore
    const versionRef = db.collection('version').doc('current');
    const versionDoc = await versionRef.get();

    if (!versionDoc.exists) {
      // Si no existe el documento, crear uno nuevo
      await versionRef.set({
        version: localVersion,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        description: 'Versión actual de la aplicación',
        source: 'version.json'
      });
      console.log(`${colors.green}✅ Documento creado en Firestore con versión: ${localVersion}${colors.reset}\n`);
      await admin.app().delete();
      process.exit(0);
    }

    const dbVersion = versionDoc.data().version;
    console.log(`${colors.blue}🗄️  Versión en Firestore: ${colors.yellow}${dbVersion}${colors.reset}\n`);

    // Comparar versiones
    const comparison = compareVersions(localVersion, dbVersion);

    if (comparison > 0) {
      // La versión local es SUPERIOR - Actualizar Firestore
      await versionRef.set({
        version: localVersion,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        description: 'Versión actual de la aplicación',
        source: 'version.json',
        previousVersion: dbVersion
      });
      console.log(`${colors.green}⬆️  Versión local superior - Firestore actualizado: ${localVersion}${colors.reset}`);
      console.log(`${colors.green}   ${dbVersion} → ${localVersion}${colors.reset}\n`);
    } else if (comparison === 0) {
      // Las versiones son IGUALES - Usar la de Firestore (no hacer nada)
      console.log(`${colors.green}✅ Versiones iguales - Usando versión de Firestore: ${dbVersion}${colors.reset}`);
      console.log(`${colors.blue}ℹ️  No se requieren cambios${colors.reset}\n`);
    } else {
      // La versión de Firestore es SUPERIOR - Advertencia
      console.log(`${colors.yellow}⚠️  ADVERTENCIA: La versión de Firestore es superior${colors.reset}`);
      console.log(`${colors.yellow}   Firestore: ${dbVersion}${colors.reset}`);
      console.log(`${colors.yellow}   Local: ${localVersion}${colors.reset}`);
      console.log(`${colors.blue}ℹ️  No se actualizó Firestore. Considera actualizar version.json${colors.reset}\n`);
    }

    await admin.app().delete();

  } catch (error) {
    console.error(`${colors.red}❌ Error al sincronizar versión:${colors.reset}`, error.message);
    process.exit(1);
  }
}

// Ejecutar
syncVersion();
