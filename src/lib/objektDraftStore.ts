const DB_NAME = "mi-objekt-drafts";
const STORE_NAME = "objekt-form-drafts";
const BLOB_STORE_NAME = "objekt-form-draft-blobs";

type DraftRecord<T> = {
  key: string;
  updatedAt: string;
  draft: T;
};

type DraftBlobRecord = {
  id: string;
  namespace: string;
  blobKey: string;
  updatedAt: string;
  file: File;
};

let dbPromise: Promise<IDBDatabase> | null = null;
const pendingDrafts = new Map<string, unknown>();
const activeWriteLoops = new Map<string, Promise<void>>();

const canUseIndexedDb = () => typeof window !== "undefined" && "indexedDB" in window;

const buildBlobRecordId = (namespace: string, blobKey: string) => `${namespace}::${blobKey}`;

const runTransaction = <T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore) => void,
) => new Promise<T>((resolve, reject) => {
  const transaction = db.transaction(storeName, mode);
  const store = transaction.objectStore(storeName);

  transaction.oncomplete = () => resolve(undefined as T);
  transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));

  executor(store);
});

const openDraftDb = async () => {
  if (!canUseIndexedDb()) throw new Error("IndexedDB unavailable");

  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, 2);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(BLOB_STORE_NAME)) {
          const blobStore = db.createObjectStore(BLOB_STORE_NAME, { keyPath: "id" });
          blobStore.createIndex("by_namespace", "namespace", { unique: false });
        } else {
          const blobStore = request.transaction?.objectStore(BLOB_STORE_NAME);
          if (blobStore && !blobStore.indexNames.contains("by_namespace")) {
            blobStore.createIndex("by_namespace", "namespace", { unique: false });
          }
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    });
  }

  return dbPromise;
};

export async function saveObjektDraft<T>(key: string, draft: T) {
  if (!canUseIndexedDb()) return;

  pendingDrafts.set(key, draft);

  if (activeWriteLoops.has(key)) {
    await activeWriteLoops.get(key);
    return;
  }

  const writeLoop = (async () => {
    while (pendingDrafts.has(key)) {
      const nextDraft = pendingDrafts.get(key) as T;
      pendingDrafts.delete(key);

      const db = await openDraftDb();
      await runTransaction<void>(db, STORE_NAME, "readwrite", (store) => {
        store.put({ key, updatedAt: new Date().toISOString(), draft: nextDraft } satisfies DraftRecord<T>);
      });
    }
  })().finally(() => {
    activeWriteLoops.delete(key);
  });

  activeWriteLoops.set(key, writeLoop);
  await writeLoop;
}

export async function loadObjektDraft<T>(key: string): Promise<T | null> {
  if (canUseIndexedDb()) {
    try {
      const db = await openDraftDb();
      const entry = await new Promise<DraftRecord<T> | undefined>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(key);

        request.onsuccess = () => resolve(request.result as DraftRecord<T> | undefined);
        request.onerror = () => reject(request.error ?? new Error("Failed to load draft"));
      });

      if (entry?.draft) return entry.draft;
    } catch {
      // Fall through to legacy localStorage recovery.
    }
  }

  if (typeof window === "undefined") return null;

  try {
    const legacy = window.localStorage.getItem(key);
    return legacy ? (JSON.parse(legacy) as T) : null;
  } catch {
    return null;
  }
}

export async function deleteObjektDraft(key: string) {
  if (canUseIndexedDb()) {
    try {
      const db = await openDraftDb();
      await runTransaction<void>(db, STORE_NAME, "readwrite", (store) => {
        store.delete(key);
      });
      await deleteObjektDraftBlobs(key);
    } catch {
      // Ignore cleanup errors.
    }
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore cleanup errors.
    }
  }
}

async function listBlobIdsForNamespace(namespace: string) {
  const db = await openDraftDb();

  return await new Promise<string[]>((resolve, reject) => {
    const transaction = db.transaction(BLOB_STORE_NAME, "readonly");
    const store = transaction.objectStore(BLOB_STORE_NAME);
    const index = store.index("by_namespace");
    const request = index.getAllKeys(namespace);

    request.onsuccess = () => resolve((request.result as string[]) ?? []);
    request.onerror = () => reject(request.error ?? new Error("Failed to list stored draft files"));
  });
}

export async function saveObjektDraftBlobs(namespace: string, blobs: Record<string, File>) {
  if (!canUseIndexedDb()) return;

  const db = await openDraftDb();
  const existingIds = new Set(await listBlobIdsForNamespace(namespace));
  const nextIds = new Set(Object.keys(blobs).map((blobKey) => buildBlobRecordId(namespace, blobKey)));

  await runTransaction<void>(db, BLOB_STORE_NAME, "readwrite", (store) => {
    Object.entries(blobs).forEach(([blobKey, file]) => {
      store.put({
        id: buildBlobRecordId(namespace, blobKey),
        namespace,
        blobKey,
        updatedAt: new Date().toISOString(),
        file,
      } satisfies DraftBlobRecord);
    });

    existingIds.forEach((id) => {
      if (!nextIds.has(id)) {
        store.delete(id);
      }
    });
  });
}

export async function loadObjektDraftBlobs(namespace: string): Promise<Record<string, File>> {
  if (!canUseIndexedDb()) return {};

  const db = await openDraftDb();

  return await new Promise<Record<string, File>>((resolve, reject) => {
    const transaction = db.transaction(BLOB_STORE_NAME, "readonly");
    const store = transaction.objectStore(BLOB_STORE_NAME);
    const index = store.index("by_namespace");
    const request = index.getAll(namespace);

    request.onsuccess = () => {
      const entries = (request.result as DraftBlobRecord[]) ?? [];
      resolve(Object.fromEntries(entries.map((entry) => [entry.blobKey, entry.file])));
    };
    request.onerror = () => reject(request.error ?? new Error("Failed to load stored draft files"));
  });
}

export async function deleteObjektDraftBlobs(namespace: string, blobKeys?: string[]) {
  if (!canUseIndexedDb()) return;

  const db = await openDraftDb();
  const idsToDelete = blobKeys?.length
    ? blobKeys.map((blobKey) => buildBlobRecordId(namespace, blobKey))
    : await listBlobIdsForNamespace(namespace);

  if (idsToDelete.length === 0) return;

  await runTransaction<void>(db, BLOB_STORE_NAME, "readwrite", (store) => {
    idsToDelete.forEach((id) => store.delete(id));
  });
}