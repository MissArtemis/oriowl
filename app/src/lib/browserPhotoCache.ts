let database: Promise<IDBDatabase> | null = null;
const urls = new Map<string, string>();

function open() {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('owltrace-photos', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('photos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  return database;
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('photos', mode);
    const request = action(tx.objectStore('photos'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getPhoto = (key: string) => transaction<Blob | undefined>('readonly', (store) => store.get(key));
export const putPhoto = (key: string, blob: Blob) =>
  transaction('readwrite', (store) => store.put(blob, key));
export function photoUrl(key: string, blob: Blob) {
  if (!urls.has(key)) urls.set(key, URL.createObjectURL(blob));
  return urls.get(key)!;
}
export async function deleteNotePhotos(noteId: string) {
  const keys = await transaction<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
  for (const key of keys) {
    if (typeof key !== 'string' || !key.startsWith(noteId + '-')) continue;
    await transaction('readwrite', (store) => store.delete(key));
    const url = urls.get(key);
    if (url) URL.revokeObjectURL(url);
    urls.delete(key);
  }
}
