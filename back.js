async function main() {
  const firestoreExportImport = await import('firestore-export-import');
  const { initializeFirebaseApp, backups } =
    firestoreExportImport.default ?? firestoreExportImport;

  const fsModule = await import('node:fs');
  const fs = fsModule.default ?? fsModule;

  const pathModule = await import('node:path');
  const path = pathModule.default ?? pathModule;

  const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  console.log('Conectando al proyecto:', serviceAccount.project_id);

  const firestore = initializeFirebaseApp(serviceAccount);

  console.log('Iniciando exportación completa...');

  const data = await backups(firestore);
  fs.writeFileSync('copia_local.json', JSON.stringify(data, null, 2));
  console.log('✅ Exportación completada con éxito en copia_local.json');
}

main().catch((error) => {
  console.error('❌ Error durante la exportación:', error);
  process.exitCode = 1;
});
