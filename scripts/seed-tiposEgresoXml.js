/* eslint-disable no-console */

/**
 * Seed/Upsert Firestore collection: tiposEgresoXml
 *
 * Usage:
 *   npm run seed:tiposEgresoXml
 *
 * Optional env:
 *   - FIRESTORE_DATABASE_ID (default: "restauracion")
 *   - GOOGLE_APPLICATION_CREDENTIALS (path to service account json)
 *
 * Notes:
 *   - If ./serviceAccountKey.json exists, it will be used automatically.
 *   - Documents are upserted using docId === nombre-codigo (sanitized).
 */

const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

const COLLECTION = 'tiposEgresoXml';

function resolveDatabaseId() {
  const fromEnv = (process.env.FIRESTORE_DATABASE_ID || process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID || '').trim();
  return fromEnv || 'restauracion';
}

function normalizeCodigo(value) {
  if (value === undefined || value === null) return '';
  const str = String(value).trim();
  if (!str) return '';
  // Preserve leading zeros if present; if purely numeric and short, pad to 3.
  if (/^\d+$/.test(str) && str.length < 3) return str.padStart(3, '0');
  return str;
}

function normalizeCuenta(value) {
  if (value === undefined || value === null) return '';
  // Keep internal spacing, but collapse runs of whitespace for consistency
  return String(value).trim().replace(/\s+/g, ' ');
}

function sanitizeDocIdSegment(value) {
  // Firestore doc IDs cannot contain '/'. Other characters are allowed, but we
  // normalize to keep IDs stable and easy to read.
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  // Replace slashes and collapse whitespace to hyphens
  let out = raw.replace(/\//g, '-').replace(/\s+/g, '-');
  // Remove characters that frequently cause messy IDs
  out = out.replace(/[\u0000-\u001F\u007F]/g, '');
  // Collapse multiple hyphens
  out = out.replace(/-+/g, '-');
  // Trim hyphens
  out = out.replace(/^-+/, '').replace(/-+$/, '');

  // Keep IDs at a reasonable length (Firestore allows long IDs, but URLs/UIs get ugly)
  if (out.length > 140) out = out.slice(0, 140).replace(/-+$/, '');
  return out;
}

function docIdFromRow(row) {
  const nombrePart = sanitizeDocIdSegment(row.nombre);
  const codigoPart = sanitizeDocIdSegment(row.codigo);
  if (!nombrePart || !codigoPart) {
    throw new Error(`Cannot build doc id for row codigo=${row.codigo}`);
  }
  return `${codigoPart} - ${nombrePart}`;
}

function loadSeedData() {
  const jsonPath = path.resolve(process.cwd(), 'scripts', 'data', 'tiposEgresoXml.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Seed data file not found: ${jsonPath}`);
  }
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Seed data must be a JSON array');
  }

  const rows = parsed.map((row, idx) => {
    const codigo = normalizeCodigo(row.codigo ?? row.Codigo);
    const nombre = String(row.nombre ?? row.Nombre ?? '').trim();
    const cuenta = normalizeCuenta(row.cuenta ?? row.Cuenta);

    if (!codigo) throw new Error(`Row ${idx} missing codigo`);
    if (!nombre) throw new Error(`Row ${idx} missing nombre`);
    if (!cuenta) throw new Error(`Row ${idx} missing cuenta`);

    return { codigo, nombre, cuenta };
  });

  // De-dup by codigo (last wins)
  const byCodigo = new Map();
  for (const r of rows) byCodigo.set(r.codigo, r);
  return Array.from(byCodigo.values());
}

function initAdmin() {
  if (admin.apps?.length) return;

  const localServiceAccountPath = path.resolve(process.cwd(), 'serviceAccountKey.json');
  if (fs.existsSync(localServiceAccountPath)) {
    const serviceAccount = require(localServiceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    return;
  }

  // Fall back to ADC (GOOGLE_APPLICATION_CREDENTIALS, gcloud, etc.)
  admin.initializeApp();
}

function getDb() {
  const databaseId = resolveDatabaseId();
  // firebase-admin supports multi-database via admin.app().firestore(databaseId)
  return databaseId ? admin.app().firestore(databaseId) : admin.firestore();
}

async function upsertAll(db, rows) {
  const FieldValue = admin.firestore.FieldValue;
  const chunkSize = 450; // keep margin under 500 writes/batch

  let written = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const batch = db.batch();

    for (const row of chunk) {
      const ref = db.collection(COLLECTION).doc(docIdFromRow(row));
      batch.set(
        ref,
        {
          codigo: row.codigo,
          nombre: row.nombre,
          cuenta: row.cuenta,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();
    written += chunk.length;
    console.log(`✅ Upserted ${written}/${rows.length} docs into ${COLLECTION}`);
  }
}

async function main() {
  initAdmin();
  const db = getDb();

  const rows = loadSeedData();
  console.log(`Seeding collection "${COLLECTION}" into database "${resolveDatabaseId()}"...`);
  console.log(`Docs to upsert: ${rows.length}`);

  await upsertAll(db, rows);

  console.log('🎉 Done');
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exitCode = 1;
});
