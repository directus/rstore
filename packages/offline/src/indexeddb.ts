async function openIndexedDBDatabase(dbName: string) {
  if (!('indexedDB' in window)) {
    throw new Error('IndexedDB is not supported in this environment.')
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      db.createObjectStore('items')
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

async function readAllItems(db: IDBDatabase, storeName: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly')
    const objectStore = transaction.objectStore(storeName)
    const request = objectStore.getAll()

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

async function writeItem(db: IDBDatabase, storeName: string, key: string, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite')
    const objectStore = transaction.objectStore(storeName)
    const request = objectStore.put(value, key)

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

async function deleteItem(db: IDBDatabase, storeName: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite')
    const objectStore = transaction.objectStore(storeName)
    const request = objectStore.delete(key)

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

async function clearDatabase(db: IDBDatabase) {
  return new Promise<void>((resolve, reject) => {
    const storeNames = Array.from(db.objectStoreNames)
    const transaction = db.transaction(storeNames, 'readwrite')
    transaction.oncomplete = () => {
      resolve()
    }
    transaction.onerror = () => {
      reject(transaction.error)
    }
    for (const storeName of storeNames) {
      const objectStore = transaction.objectStore(storeName)
      objectStore.clear()
    }
  })
}

export async function useIndexedDb(dbNamePrefix: string) {
  async function getDb(storeName: string) {
    const dbName = `${dbNamePrefix}-${storeName}`
    const db = await openIndexedDBDatabase(dbName)
    return db
  }

  return {
    readAllItems: async (storeName: string) => readAllItems(await getDb(storeName), 'items'),
    writeItem: async (storeName: string, key: string, value: any) => writeItem(await getDb(storeName), 'items', key, value),
    deleteItem: async (storeName: string, key: string) => deleteItem(await getDb(storeName), 'items', key),
    clearDatabase: async (storeName: string) => clearDatabase(await getDb(storeName)),
  }
}
