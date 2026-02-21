const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    file: 'recetas.json',
    collection: 'recetas',
    merge: false,
    dryRun: false,
    keepDateStrings: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--file' || token === '-f') {
      args.file = argv[i + 1];
      i++;
      continue;
    }
    if (token === '--collection' || token === '-c') {
      args.collection = argv[i + 1];
      i++;
      continue;
    }
    if (token === '--merge') {
      args.merge = true;
      continue;
    }
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (token === '--keep-date-strings') {
      args.keepDateStrings = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
  }

  return args;
}

function printHelp() {
  console.log(`\nUso: node import.js [opciones]\n\nOpciones:\n  -f, --file <ruta>                Archivo JSON a importar (default: productos.json)\n  -c, --collection <nombre>        Colección destino en Firestore (default: productos)\n      --merge                      Hace merge (set(..., { merge: true })) en lugar de overwrite\n      --dry-run                    No escribe nada, solo muestra cuántos docs importaría\n      --keep-date-strings          No convierte createdAt/updateAt/updatedAt a Timestamp (se quedan como string/map)\n  -h, --help                       Muestra esta ayuda\n\nEjemplos:\n  node import.js\n  node import.js --file productos.json --collection productos\n  node import.js --merge\n`);
}

function isIsoDateString(value) {
  if (typeof value !== 'string') return false;
  // Simple check: Date.parse accepts a lot; we still restrict to ISO-ish shape.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function isSecondsNanosMap(value) {
  if (!value || typeof value !== 'object') return false;
  const seconds = value._seconds ?? value.seconds;
  const nanos = value._nanoseconds ?? value.nanoseconds;
  return typeof seconds === 'number' && typeof nanos === 'number';
}

function toTimestamp(value) {
  if (isIsoDateString(value)) {
    return admin.firestore.Timestamp.fromDate(new Date(value));
  }

  if (isSecondsNanosMap(value)) {
    const seconds = value._seconds ?? value.seconds;
    const nanos = value._nanoseconds ?? value.nanoseconds;
    return new admin.firestore.Timestamp(seconds, nanos);
  }

  return value;
}

function normalizeInput(json) {
  // Formato esperado del export.js: [{ id, ...data }]
  if (Array.isArray(json)) {
    return json;
  }

  // Si viene como { docs: [...] } (por compatibilidad básica)
  if (json && typeof json === 'object' && Array.isArray(json.docs)) {
    return json.docs;
  }

  throw new Error(
    'Formato de JSON no soportado. Se espera un array de documentos: [{ id, ...data }].'
  );
}

async function importCollection({ file, collection, merge, dryRun, keepDateStrings }) {
  const filePath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontró el archivo: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const docs = normalizeInput(parsed);

  if (docs.length === 0) {
    console.log('No hay documentos que importar.');
    return;
  }

  console.log(`Archivo: ${filePath}`);
  console.log(`Colección destino: ${collection}`);
  console.log(`Docs a importar: ${docs.length}`);
  console.log(`Modo: ${dryRun ? 'dry-run' : merge ? 'merge' : 'overwrite'}`);

  if (dryRun) {
    return;
  }

  const db = admin.firestore();
  const colRef = db.collection(collection);

  const BATCH_LIMIT = 500;
  let batch = db.batch();
  let opsInBatch = 0;
  let imported = 0;

  const DATE_KEYS = new Set(['createdAt', 'updateAt', 'updatedAt']);

  for (const item of docs) {
    if (!item || typeof item !== 'object') continue;

    const { id, ...dataRaw } = item;
    if (!id || typeof id !== 'string') {
      throw new Error(
        'Documento sin "id" (string). Asegúrate de usar el JSON generado por export.js.'
      );
    }

    const data = { ...dataRaw };

    if (!keepDateStrings) {
      for (const key of DATE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          data[key] = toTimestamp(data[key]);
        }
      }
    }

    const docRef = colRef.doc(id);
    batch.set(docRef, data, { merge });
    opsInBatch++;
    imported++;

    if (opsInBatch >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
      console.log(`✅ Importados ${imported}/${docs.length}...`);
    }
  }

  if (opsInBatch > 0) {
    await batch.commit();
  }

  console.log(`✅ Importación completada. Total importados: ${imported}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  // Cargar credenciales (mismo enfoque que export.js)
  const serviceAccount = require('./serviceAccountKey.json');

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  await importCollection(args);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error al importar:', error);
    process.exit(1);
  });
