import type { CardProjectV1 } from "@lunchtable-tcg/card-studio-sdk";

const DB_NAME = "ltcg-card-studio";
const STORE_NAME = "projects";
const ACTIVE_KEY = "active";

function openStudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function saveActiveProject(project: CardProjectV1): Promise<void> {
  const db = await openStudioDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE_NAME).put(project, ACTIVE_KEY);
  });
  db.close();
}

export async function loadActiveProject(): Promise<CardProjectV1 | null> {
  const db = await openStudioDb();
  const value = await new Promise<CardProjectV1 | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    tx.onerror = () => reject(tx.error);
    const request = tx.objectStore(STORE_NAME).get(ACTIVE_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as CardProjectV1 | undefined) ?? null);
  });
  db.close();
  return value;
}
