export type XmlFileRecord = {
  fileName: string;
  tipoEgreso: string | null;
  xmlText: string;
  createdAt: number;
};

const DB_NAME = 'xml-egresos-db';
const DB_VERSION = 1;
const STORE_NAME = 'xmlFiles';

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openOnce(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'fileName' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña/instancia'));
  });
}

async function deleteDatabase(): Promise<void> {
  if (!hasIndexedDb()) return;

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('No se pudo borrar la base IndexedDB'));
    request.onblocked = () => reject(new Error('No se pudo borrar la base IndexedDB (blocked)'));
  });
}

export async function openXmlEgresosDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) {
    throw new Error('IndexedDB no está disponible en este entorno.');
  }

  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        return await openOnce();
      } catch {
        // Si la base está corrupta o en un estado raro, recreamos.
        // Nota: esto sólo corre si el open inicial falla.
        try {
          await deleteDatabase();
        } catch {
          // ignore delete errors
        }
        return await openOnce();
      }
    })();
  }

  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Error en operación IndexedDB'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transacción IndexedDB fallida'));
    tx.onabort = () => reject(tx.error ?? new Error('Transacción IndexedDB abortada'));
  });
}

export async function getAllXmlFiles(): Promise<XmlFileRecord[]> {
  const db = await openXmlEgresosDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const records = await requestToPromise(store.getAll() as IDBRequest<XmlFileRecord[]>);
  await txDone(tx);
  return records || [];
}

export async function getXmlFile(fileName: string): Promise<XmlFileRecord | undefined> {
  const db = await openXmlEgresosDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const record = await requestToPromise(store.get(fileName) as IDBRequest<XmlFileRecord | undefined>);
  await txDone(tx);
  return record;
}

export async function putXmlFile(record: XmlFileRecord): Promise<void> {
  const db = await openXmlEgresosDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.put(record);
  await txDone(tx);
}

export async function updateXmlTipoEgreso(fileName: string, tipoEgreso: string | null): Promise<void> {
  const db = await openXmlEgresosDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);

  const existing = await requestToPromise(store.get(fileName) as IDBRequest<XmlFileRecord | undefined>);
  if (!existing) {
    await txDone(tx);
    return;
  }

  store.put({ ...existing, tipoEgreso });
  await txDone(tx);
}

export async function deleteXmlFile(fileName: string): Promise<void> {
  const db = await openXmlEgresosDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.delete(fileName);
  await txDone(tx);
}

export async function clearXmlFiles(): Promise<void> {
  const db = await openXmlEgresosDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  await txDone(tx);
}
