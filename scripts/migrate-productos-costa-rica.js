const admin = require('firebase-admin');

function parseArgs(argv) {
  const args = {
    collection: 'recetas',
    apply: false,
    fields: ['createdAt', 'updateAt'],
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
  console.log(`\nUso: node scripts/migrate-productos-costa-rica.js [opciones]\n\nConvierte campos tipo fecha guardados como string ISO en UTC con sufijo Z (ej: 2026-02-20T06:18:43.950Z)\na un string ISO-like en hora Costa Rica con offset -06:00 (ej: 2026-02-20T00:18:43.950-06:00).\n\nOpciones:\n  -c, --collection <nombre>    Colección a migrar (default: productos)\n      --fields <a,b,c>         Campos a revisar (default: createdAt,updateAt)\n      --page-size <n>          Tamaño de página para leer docs (default: 400, max 450)\n      --apply                  Aplica cambios (si no, es dry-run)\n  -h, --help                   Ayuda\n\nEjemplos:\n  node scripts/migrate-productos-costa-rica.js\n  node scripts/migrate-productos-costa-rica.js --apply\n  node scripts/migrate-productos-costa-rica.js --fields createdAt,updateAt --apply\n`);
}

function isIsoUtcZString(value) {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function pad3(value) {
  return String(Math.trunc(value)).padStart(3, '0');
}

function toCostaRicaISO(date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const out = {};
  for (const p of parts) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }

  const ms = pad3(date.getMilliseconds());
  const year = out.year || '0000';
  const month = out.month || '01';
  const day = out.day || '01';
  const hour = out.hour || '00';
  const minute = out.minute || '00';
  const second = out.second || '00';

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}-06:00`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const serviceAccount = require('../serviceAccountKey.json');
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
      const data = doc.data() || {};
      const patch = {};
      let needsUpdate = false;

      for (const field of args.fields) {
        if (!Object.prototype.hasOwnProperty.call(data, field)) continue;
        const value = data[field];
        if (!isIsoUtcZString(value)) continue;
        patch[field] = toCostaRicaISO(new Date(value));
        needsUpdate = true;
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
