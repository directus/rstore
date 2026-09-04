interface IndexedDbConnection {
  /** Connection shared by helpers using this physical IndexedDB database. */
  promise: Promise<IDBDatabase>
  /** Number of helpers currently using the connection. */
  users: number
}

const connections = new Map<string, IndexedDbConnection>()

async function openIndexedDBDatabase(dbName: string) {
  if (typeof indexedDB === 'undefined') {
    throw new TypeError('IndexedDB is not supported in this environment.')
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
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readItem(db: IDBDatabase, storeName: string, key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly')
    const objectStore = transaction.objectStore(storeName)
    const request = objectStore.get(key)

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function writeItem(db: IDBDatabase, storeName: string, key: string, value: any): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite')
    const objectStore = transaction.objectStore(storeName)
    objectStore.put(value, key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

async function deleteItem(db: IDBDatabase, storeName: string, key: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite')
    const objectStore = transaction.objectStore(storeName)
    objectStore.delete(key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

/** Write and delete a collection's changed rows in one atomic transaction. */
async function applyChanges(db: IDBDatabase, storeName: string, changes: IndexedDbChanges): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite')
    const objectStore = transaction.objectStore(storeName)
    for (const key of changes.deleteKeys) {
      objectStore.delete(key)
    }
    for (const { key, value } of changes.writes) {
      objectStore.put(value, key)
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
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
  const acquiredDatabases = new Set<string>()

  async function getDb(storeName: string) {
    const dbName = `${dbNamePrefix}-${storeName}`
    if (!acquiredDatabases.has(dbName)) {
      acquiredDatabases.add(dbName)
      return acquireDatabase(dbName)
    }
    return connections.get(dbName)?.promise ?? acquireDatabase(dbName)
  }

  return {
    readAllItems: async (storeName: string) => readAllItems(await getDb(storeName), 'items'),
    readItem: async (storeName: string, key: string) => readItem(await getDb(storeName), 'items', key),
    writeItem: async (storeName: string, key: string, value: any) => writeItem(await getDb(storeName), 'items', key, value),
    deleteItem: async (storeName: string, key: string) => deleteItem(await getDb(storeName), 'items', key),
    applyChanges: async (storeName: string, changes: IndexedDbChanges) => applyChanges(await getDb(storeName), 'items', changes),
    clearDatabase: async (storeName: string) => clearDatabase(await getDb(storeName)),
    dispose: () => {
      for (const dbName of acquiredDatabases) {
        releaseDatabase(dbName)
      }
      acquiredDatabases.clear()
    },
  }
}

/** Rows to remove and write in one IndexedDB transaction. */
export interface IndexedDbChanges {
  /** Serialized keys to remove. */
  deleteKeys: string[]
  /** Serialized keys and values to write. */
  writes: Array<{ key: string, value: any }>
}

/** Acquire a shared connection for one physical IndexedDB database. */
function acquireDatabase(dbName: string): Promise<IDBDatabase> {
  let connection = connections.get(dbName)
  if (!connection) {
    connection = {
      promise: openIndexedDBDatabase(dbName),
      users: 0,
    }
    connections.set(dbName, connection)
    connection.promise.then((db) => {
      db.onclose = () => {
        if (connections.get(dbName) === connection) {
          connections.delete(dbName)
        }
      }
    }).catch(() => {
      if (connections.get(dbName) === connection) {
        connections.delete(dbName)
      }
    })
  }
  connection.users++
  return connection.promise
}

/** Release one helper's shared connection lease. */
function releaseDatabase(dbName: string): void {
  const connection = connections.get(dbName)
  if (!connection) {
    return
  }
  connection.users--
  if (connection.users > 0) {
    return
  }
  connections.delete(dbName)
  connection.promise.then(db => db.close()).catch(() => {})
}
