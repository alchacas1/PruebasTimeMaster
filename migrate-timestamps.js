const admin = require('firebase-admin');

function parseArgs(argv) {
  const args = {
    collection: 'productos',
    apply: false,
    fields: ['createdAt', 'updateAt', 'updatedAt'],
    pageSize: 400,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--collection' || token === '-c') {
      args.collection = argv[i + 1];
      i++;
      continue;
    }
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--fields') {
      const raw = argv[i + 1];
      i++;
      if (raw) {
        args.fields = raw.split(',').map((s) => s.trim()).filter(Boolean);
      }
      continue;
    }
    if (token === '--page-size') {
      const n = Number(argv[i + 1]);
      i++;
      if (Number.isFinite(n) && n > 0 && n <= 450) args.pageSize = Math.floor(n);
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
  console.log(`\nUso: node migrate-timestamps.js [opciones]\n\nConvierte campos tipo fecha que estén guardados como:\n- map { _seconds, _nanoseconds }\n- string ISO 2025-11-10T19:56:59.725Z\n\na Firestore Timestamp real, para que en la consola no salga como (map).\n\nOpciones:\n  -c, --collection <nombre>    Colección a migrar (default: productos)\n      --fields <a,b,c>         Campos a revisar (default: createdAt,updateAt,updatedAt)\n      --page-size <n>          Tamaño de página para leer docs (default: 400, max 450)\n      --apply                  Aplica cambios (si no, es dry-run)\n  -h, --help                   Ayuda\n\nEjemplos:\n  node migrate-timestamps.js\n  node migrate-timestamps.js --collection productos\n  node migrate-timestamps.js --apply\n  node migrate-timestamps.js --fields createdAt,updateAt --apply\n`);
}

function isIsoDateString(value) {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function isSecondsNanosMap(value) {
  if (!value || typeof value !== 'object') return false;
  const seconds = value._seconds ?? value.seconds;
  const nanos = value._nanoseconds ?? value.nanoseconds ?? 0;
  return typeof seconds === 'number' && typeof nanos === 'number';
}

function toTimestamp(value) {
  if (value instanceof admin.firestore.Timestamp) return value;

  if (isIsoDateString(value)) {
    return admin.firestore.Timestamp.fromDate(new Date(value));
  }

  if (isSecondsNanosMap(value)) {
    const seconds = value._seconds ?? value.seconds;
    const nanos = value._nanoseconds ?? value.nanoseconds ?? 0;
    return new admin.firestore.Timestamp(seconds, nanos);
  }

  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const serviceAccount = require('./serviceAccountKey.json');
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  const db = admin.firestore();
  const colRef = db.collection(args.collection);

  console.log(`Colección: ${args.collection}`);
  console.log(`Campos: ${args.fields.join(', ')}`);
  console.log(`Modo: ${args.apply ? 'APLICAR' : 'dry-run'}`);

  let lastDoc = null;
  let scanned = 0;
  let candidates = 0;
  let updated = 0;

  while (true) {
    let q = colRef.orderBy(admin.firestore.FieldPath.documentId()).limit(args.pageSize);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    let ops = 0;

    for (const doc of snap.docs) {
      scanned++;
      const data = doc.data();
      const patch = {};
      let needsUpdate = false;

      for (const field of args.fields) {
        if (!Object.prototype.hasOwnProperty.call(data, field)) continue;
        const ts = toTimestamp(data[field]);
        if (ts) {
          patch[field] = ts;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        candidates++;
        if (args.apply) {
          batch.update(doc.ref, patch);
          ops++;
        }
      }

      lastDoc = doc;
    }

    if (args.apply && ops > 0) {
      await batch.commit();
      updated += ops;
      console.log(`✅ Batch aplicado. Total actualizados: ${updated}`);
    } else {
      console.log(`🔎 Escaneados: ${scanned}. Candidatos (a cambiar): ${candidates}`);
    }
  }

  console.log('---');
  console.log(`Listo. Escaneados: ${scanned}`);
  console.log(`Candidatos: ${candidates}`);
  console.log(`Actualizados: ${updated}`);
  if (!args.apply) {
    console.log('No se aplicaron cambios. Ejecuta con --apply para actualizar.');
  }
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
