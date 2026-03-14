import type { WebContainer } from '@webcontainer/api'
import type { TutorialSnapshot } from './types'

const CACHE_DB_NAME = 'rstore-docs-tutorial'
const CACHE_STORE_NAME = 'webcontainer-cache'
const CACHE_RECORD_KEY = 'dependency-cache'
const CACHE_VERSION = 2

type TutorialDependencyCacheCompression = 'none' | 'gzip'

interface TutorialDependencyCacheRecord {
  version: number
  dependencySignature: string
  nodeModulesSnapshot: Uint8Array
  compression: TutorialDependencyCacheCompression
  packageLock: string | null
  savedAt: number
}

export type TutorialDependencyCacheRestoreResult = 'hit' | 'miss' | 'stale' | 'unsupported'

export function getTutorialDependencyCacheSignature(snapshot: TutorialSnapshot) {
  if (!snapshot['package.json']) {
    return null
  }

  const relevantEntries = Object.entries(snapshot)
    .filter(([filePath]) =>
      filePath === 'package.json'
      || /^vendor\/@rstore\/[^/]+\/package\.json$/.test(filePath),
    )
    .sort(([left], [right]) => left.localeCompare(right))

  return JSON.stringify(relevantEntries)
}

function canUseIndexedDb() {
  return typeof indexedDB !== 'undefined'
}

function runRequest<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve()
    }

    transaction.onabort = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'))
    }

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
    }
  })
}

async function openCacheDatabase() {
  if (!canUseIndexedDb()) {
    throw new Error('IndexedDB is not available in this environment.')
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME, CACHE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(CACHE_STORE_NAME)) {
        database.createObjectStore(CACHE_STORE_NAME)
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

async function readCacheRecord() {
  const database = await openCacheDatabase()

  try {
    const transaction = database.transaction(CACHE_STORE_NAME, 'readonly')
    const store = transaction.objectStore(CACHE_STORE_NAME)
    const record = await runRequest(store.get(CACHE_RECORD_KEY) as IDBRequest<TutorialDependencyCacheRecord | undefined>)
    await waitForTransaction(transaction)

    return record ?? null
  }
  finally {
    database.close()
  }
}

async function readStreamBytes(stream: ReadableStream<Uint8Array>) {
  const response = new Response(stream)
  return new Uint8Array(await response.arrayBuffer())
}

function cloneSnapshotBytes(snapshot: Uint8Array) {
  const clone = new Uint8Array(snapshot.byteLength)
  clone.set(snapshot)
  return clone
}

async function compressSnapshot(snapshot: Uint8Array) {
  if (typeof CompressionStream !== 'function') {
    return {
      compression: 'none' as const,
      payload: snapshot,
    }
  }

  const compressed = await readStreamBytes(
    new Blob([cloneSnapshotBytes(snapshot)]).stream().pipeThrough(new CompressionStream('gzip')),
  )

  return {
    compression: 'gzip' as const,
    payload: compressed,
  }
}

async function decompressSnapshot(
  snapshot: Uint8Array,
  compression: TutorialDependencyCacheCompression | undefined,
) {
  if (!compression || compression === 'none') {
    return snapshot
  }

  if (compression === 'gzip') {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('DecompressionStream is not available in this environment.')
    }

    return readStreamBytes(
      new Blob([cloneSnapshotBytes(snapshot)]).stream().pipeThrough(new DecompressionStream('gzip')),
    )
  }

  return snapshot
}

async function writeCacheRecord(record: TutorialDependencyCacheRecord) {
  const database = await openCacheDatabase()

  try {
    const transaction = database.transaction(CACHE_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(CACHE_STORE_NAME)
    await runRequest(store.put(record, CACHE_RECORD_KEY))
    await waitForTransaction(transaction)
  }
  finally {
    database.close()
  }
}

export async function clearTutorialDependencyCache() {
  if (!canUseIndexedDb()) {
    return
  }

  const database = await openCacheDatabase()

  try {
    const transaction = database.transaction(CACHE_STORE_NAME, 'readwrite')
    const store = transaction.objectStore(CACHE_STORE_NAME)
    await runRequest(store.delete(CACHE_RECORD_KEY))
    await waitForTransaction(transaction)
  }
  finally {
    database.close()
  }
}

export async function restoreTutorialDependencyCache(
  instance: WebContainer,
  dependencySignature: string,
): Promise<TutorialDependencyCacheRestoreResult> {
  if (!canUseIndexedDb()) {
    return 'unsupported'
  }

  const record = await readCacheRecord()

  if (!record) {
    return 'miss'
  }

  if (record.version !== CACHE_VERSION || record.dependencySignature !== dependencySignature) {
    await clearTutorialDependencyCache().catch(() => null)
    return 'stale'
  }

  try {
    const nodeModulesSnapshot = await decompressSnapshot(
      record.nodeModulesSnapshot,
      record.compression,
    )

    await instance.mount(nodeModulesSnapshot, {
      mountPoint: 'node_modules',
    })

    if (record.packageLock) {
      await instance.fs.writeFile('package-lock.json', record.packageLock)
    }

    return 'hit'
  }
  catch {
    await Promise.allSettled([
      clearTutorialDependencyCache(),
      instance.fs.rm('node_modules', {
        recursive: true,
        force: true,
      }),
    ])

    return 'stale'
  }
}

export async function saveTutorialDependencyCache(
  instance: WebContainer,
  dependencySignature: string,
) {
  if (!canUseIndexedDb()) {
    return false
  }

  let nodeModulesSnapshot: Uint8Array

  try {
    nodeModulesSnapshot = await instance.export('node_modules', {
      format: 'binary',
    }) as Uint8Array
  }
  catch {
    return false
  }

  let packageLock: string | null = null

  try {
    packageLock = await instance.fs.readFile('package-lock.json', 'utf8')
  }
  catch {
    packageLock = null
  }

  const {
    compression,
    payload,
  } = await compressSnapshot(nodeModulesSnapshot)

  await writeCacheRecord({
    version: CACHE_VERSION,
    dependencySignature,
    nodeModulesSnapshot: payload,
    compression,
    packageLock,
    savedAt: Date.now(),
  })

  return true
}
