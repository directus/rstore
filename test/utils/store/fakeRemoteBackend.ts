import type { Where } from './matchWhere'
import { klona } from 'klona'
import { applyOrderBy, matchWhere } from './matchWhere'

/**
 * The row store behind {@link import('./fakeRemote').createFakeRemote}.
 *
 * Deliberately hand-written rather than built on
 * `@rstore/connector-toolkit`'s filter engine: the client cache filters with
 * that engine, so a fake backend sharing it could never reveal a server/cache
 * divergence.
 */

/** Query parameters the fake remote understands, sent through `params`. */
export interface FakeRemoteParams {
  where?: Where
  orderBy?: string | string[]
  limit?: number
  offset?: number
}

/** Reads the primary key of a backend row. */
export type FakeRemoteGetKey = (collection: string, item: Record<string, any>) => string | number

/**
 * How the key of one collection is read: a field name, or a function.
 *
 * Deliberately **not** `collection.getKey`: that is product code, and a fake
 * backend that shared it could never reveal a key-resolution divergence.
 */
export type FakeRemoteKeyResolver = string | ((item: Record<string, any>) => string | number)

/** One resolver for every collection, or one per collection name. */
export type FakeRemoteKeys = FakeRemoteKeyResolver | Record<string, FakeRemoteKeyResolver>

/** Key configuration of a fake backend. */
export interface FakeRemoteKeyOptions {
  /** Key field, key function, or one of either per collection. Default `'id'`. */
  keys?: FakeRemoteKeys
  /**
   * Reads the key of a row of any collection.
   *
   * @deprecated Use {@link FakeRemoteKeyOptions.keys}, which also tells the
   * backend *which field* holds the key, so `updateItem` can put the mutation
   * key back on the row it writes.
   */
  getKey?: FakeRemoteGetKey
}

/** In-memory rows, keyed by collection name, with query and write helpers. */
export interface FakeRemoteBackend {
  /** Primary key of a row of `collection`. */
  getKey: FakeRemoteGetKey
  /** Field holding the key of `collection`, or `undefined` for a key function. */
  keyField: (collection: string) => string | undefined
  /**
   * Copy of `item` carrying `key` in the key field of `collection`.
   *
   * `updateItem` sends the key next to a partial item; the backend has to put
   * it back on the row so the upsert matches the row already stored.
   */
  withKey: (collection: string, item: Record<string, any>, key: string | number) => Record<string, any>
  /** Replaces the rows of a collection with copies of `rows`. */
  seed: (collection: string, rows: Array<Record<string, any>>) => void
  /** Copies of the current rows of a collection. */
  rows: (collection: string) => Array<Record<string, any>>
  /** Applies `where`, `orderBy` and pagination, returning row copies. */
  select: (collection: string, findOptions: any) => Array<Record<string, any>>
  /** Writes a row, merging into any row with the same key. Returns a copy. */
  upsert: (collection: string, item: Record<string, any>) => Record<string, any>
  /** Removes a row by key. Returns whether a row was actually removed. */
  remove: (collection: string, key: string | number) => boolean
  /** Removes every row of a collection whose key is in `keys`. */
  removeMany: (collection: string, keys: Array<string | number>) => void
}

/**
 * Creates the in-memory backend of a fake remote.
 *
 * @param initialData Initial rows, keyed by collection name.
 * @param keyOptions How the primary key of a row is read. Defaults to `'id'`.
 */
export function createFakeRemoteBackend(
  initialData: Record<string, Array<Record<string, any>>> = {},
  keyOptions: FakeRemoteKeyOptions = {},
): FakeRemoteBackend {
  const data = new Map<string, Array<Record<string, any>>>()
  for (const [collection, rows] of Object.entries(initialData)) {
    data.set(collection, klona(rows))
  }

  const { keys = 'id', getKey: legacyGetKey } = keyOptions
  // A string or a function applies to every collection; anything else is a
  // per-collection record, with `'id'` for the collections it omits.
  const perCollection = typeof keys === 'string' || typeof keys === 'function' ? null : keys

  /** The resolver configured for `collection`. */
  function resolver(collection: string): FakeRemoteKeyResolver {
    return (perCollection ? perCollection[collection] : keys as FakeRemoteKeyResolver) ?? 'id'
  }

  const getKey: FakeRemoteGetKey = (collection, item) => {
    if (legacyGetKey) {
      return legacyGetKey(collection, item)
    }
    const resolve = resolver(collection)
    return typeof resolve === 'function' ? resolve(item) : item[resolve]
  }

  function keyField(collection: string) {
    if (legacyGetKey) {
      return undefined
    }
    const resolve = resolver(collection)
    return typeof resolve === 'string' ? resolve : undefined
  }

  function bucket(collection: string) {
    let rows = data.get(collection)
    if (!rows) {
      rows = []
      data.set(collection, rows)
    }
    return rows
  }

  return {
    getKey,
    keyField,

    withKey: (collection, item, key) => {
      const field = keyField(collection)
      return field ? { ...item, [field]: key } : { ...item }
    },

    seed: (collection, rows) => {
      data.set(collection, klona(rows))
    },

    rows: collection => klona(bucket(collection)),

    select: (collection, findOptions) => {
      const params: FakeRemoteParams = findOptions?.params ?? {}
      let rows = bucket(collection).filter(row => matchWhere(row, params.where))
      rows = applyOrderBy(rows, params.orderBy)
      // Page options win over raw `offset`/`limit`, like a paginated endpoint.
      const offset = findOptions?.pageIndex != null && findOptions?.pageSize != null
        ? findOptions.pageIndex * findOptions.pageSize
        : params.offset ?? 0
      const limit = findOptions?.pageSize ?? params.limit
      rows = rows.slice(offset, limit != null ? offset + limit : undefined)
      return klona(rows)
    },

    upsert: (collection, item) => {
      const rows = bucket(collection)
      const key = getKey(collection, item)
      const index = rows.findIndex(row => getKey(collection, row) === key)
      if (index === -1) {
        rows.push(klona(item))
      }
      else {
        rows[index] = klona({ ...rows[index], ...item })
      }
      return klona(rows.find(row => getKey(collection, row) === key)!)
    },

    remove: (collection, key) => {
      const rows = bucket(collection)
      const index = rows.findIndex(row => getKey(collection, row) === key)
      if (index === -1) {
        return false
      }
      rows.splice(index, 1)
      return true
    },

    removeMany: (collection, keys) => {
      data.set(collection, bucket(collection).filter(row => !keys.includes(getKey(collection, row))))
    },
  }
}
