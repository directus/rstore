import type { Ref } from 'vue'
import type { CachedPageRefs, CacheRuntime } from './types'
import { klona } from 'klona'
import { ref } from 'vue'
import { forgetQueryStateHolders, isQueryStateHeld } from './queryHolders'

/** Accepted collection writes, observed only for unkeyed absence decisions. */
const collectionWrites = new WeakMap<CacheRuntime['state'], Map<string, number>>()

/** Accepted writes for keys observed by authoritative absence pages. */
const itemWrites = new WeakMap<CacheRuntime['state'], Map<string, Map<string, number>>>()

/** Observe a collection's accepted-write generation without retaining its cache. */
export function getCollectionWriteVersion(state: CacheRuntime['state'], collectionName: string): number {
  let versions = collectionWrites.get(state)
  if (!versions) {
    versions = new Map()
    collectionWrites.set(state, versions)
  }
  if (!versions.has(collectionName))
    versions.set(collectionName, 0)
  return versions.get(collectionName)!
}

/** Observe only keys needed by absence pages, normalizing numeric cache keys. */
export function getItemWriteVersion(state: CacheRuntime['state'], collectionName: string, key: string | number): number {
  let collections = itemWrites.get(state)
  if (!collections) {
    collections = new Map()
    itemWrites.set(state, collections)
  }
  let versions = collections.get(collectionName)
  if (!versions) {
    versions = new Map()
    collections.set(collectionName, versions)
  }
  const normalizedKey = String(key)
  if (!versions.has(normalizedKey))
    versions.set(normalizedKey, 0)
  return versions.get(normalizedKey)!
}

/** Reactive clear generations, observed by queries to drop confirmation. */
const collectionClears = new WeakMap<CacheRuntime['state'], Map<string, Ref<number>>>()

/** Reactive generation of `clearCollection` calls for one collection. */
export function getCollectionClearVersion(state: CacheRuntime['state'], collectionName: string): number {
  let clears = collectionClears.get(state)
  if (!clears) {
    clears = new Map()
    collectionClears.set(state, clears)
  }
  let version = clears.get(collectionName)
  if (!version) {
    version = ref(0)
    clears.set(collectionName, version)
  }
  return version.value
}

/** Detach saved page refs at snapshot boundaries (`getState`/`setState`). */
export function clonePageRefs(entries: Iterable<[string, CachedPageRefs]>): Array<[string, CachedPageRefs]> {
  return Array.from(entries, ([pageId, saved]) => [pageId, klona(saved)])
}

/**
 * Drop query metadata and page refs that target one collection.
 */
export function clearQueryStateForCollection(ctx: CacheRuntime, collectionName: string) {
  const clears = collectionClears.get(ctx.state)?.get(collectionName)
  if (clears)
    clears.value++
  for (const queryId of Object.keys(ctx.state.queryMeta)) {
    if (isQueryStateKeyForCollection(queryId, collectionName)) {
      delete ctx.state.queryMeta[queryId]
      forgetQueryStateBookkeeping(ctx, queryId)
    }
  }

  for (const pageId of ctx.state.pageRefs.keys()) {
    const queryId = getPageQueryId(pageId)
    if (queryId && isQueryStateKeyForCollection(queryId, collectionName)) {
      ctx.state.pageRefs.delete(pageId)
      forgetQueryStateBookkeeping(ctx, queryId)
    }
  }
  itemWrites.get(ctx.state)?.delete(collectionName)
}

/**
 * Drop all query metadata and page refs.
 */
export function clearAllQueryState(ctx: CacheRuntime) {
  ctx.state.pageRefs.clear()
  ctx.queryStateUsedAt.clear()
  forgetQueryStateHolders(ctx.state)
  resetItemWrites(ctx)
}

/**
 * Forget every key's write generation when the cache rows are replaced.
 *
 * A live absence that captured a non-zero generation reads as released
 * afterwards, which then shows the replaced cache view instead of a miss.
 */
export function resetItemWrites(ctx: CacheRuntime) {
  itemWrites.delete(ctx.state)
}

/** Release computed absence when a later write can change its membership. */
export function invalidateMissingPageRefsForItem(ctx: CacheRuntime, collectionName: string, key: string | number): void {
  const versions = collectionWrites.get(ctx.state)
  if (versions?.has(collectionName))
    versions.set(collectionName, versions.get(collectionName)! + 1)
  const keys = itemWrites.get(ctx.state)?.get(collectionName)
  const normalizedKey = String(key)
  if (keys?.has(normalizedKey))
    keys.set(normalizedKey, keys.get(normalizedKey)! + 1)
  // Runs on every item write: test the saved entry before parsing its page id.
  for (const [pageId, result] of ctx.state.pageRefs) {
    if (result.type !== 'data' || result.resultMode !== 'computed' || result.invalidated)
      continue
    if (result.key != null && String(result.key) !== normalizedKey)
      continue
    const queryId = getPageQueryId(pageId)
    if (queryId && isQueryStateKeyForCollection(queryId, collectionName))
      result.invalidated = true
  }
}

/**
 * Drop response references to one evicted item without disturbing other
 * pages, then the metadata of queries left with no saved page or consumer.
 */
export function invalidatePageRefsForItem(ctx: CacheRuntime, collectionName: string, key: string | number): void {
  const evicted = new Set<string>()
  for (const [pageId, ref] of ctx.state.pageRefs) {
    const queryId = getPageQueryId(pageId)
    if (!queryId || !isQueryStateKeyForCollection(queryId, collectionName)) {
      continue
    }
    if (ref.type === 'data') {
      continue
    }
    const keys = ref.type === 'ref' ? [ref.key] : ref.keys
    if (keys.some(candidate => String(candidate) === String(key))) {
      ctx.state.pageRefs.delete(pageId)
      evicted.add(queryId)
    }
  }
  for (const queryId of evicted) {
    releaseQueryMeta(ctx, queryId)
  }
}

/** Drop metadata of a query left without saved pages or a live consumer. */
function releaseQueryMeta(ctx: CacheRuntime, queryId: string, savedQueryIds?: Set<string>) {
  if (!(queryId in ctx.state.queryMeta) || isQueryStateHeld(ctx.state, queryId)) {
    return
  }
  if (savedQueryIds ? savedQueryIds.has(queryId) : hasSavedPage(ctx, queryId)) {
    return
  }
  delete ctx.state.queryMeta[queryId]
  forgetQueryStateBookkeeping(ctx, queryId)
}

/**
 * Forget retention timestamps and consumers of a query id whose saved state
 * is gone, so these side tables never outgrow the state they describe.
 */
function forgetQueryStateBookkeeping(ctx: CacheRuntime, queryId: string) {
  ctx.queryStateUsedAt.delete(queryId)
  forgetQueryStateHolders(ctx.state, queryId)
}

/** Whether any page of a query still has saved refs. */
function hasSavedPage(ctx: CacheRuntime, queryId: string) {
  for (const pageId of ctx.state.pageRefs.keys()) {
    if (getPageQueryId(pageId) === queryId) {
      return true
    }
  }
  return false
}

/**
 * Extract the serialized query id from a page id.
 */
export function getPageQueryId(pageId: string) {
  const pageSeparatorIndex = pageId.lastIndexOf('#')
  if (pageSeparatorIndex === -1) {
    return undefined
  }

  const pageIndex = pageId.slice(pageSeparatorIndex + 1)
  if (!/^\d+$/.test(pageIndex)) {
    return undefined
  }

  return pageId.slice(0, pageSeparatorIndex)
}

/**
 * Check whether a serialized query id belongs to the given collection.
 *
 * Query ids are `JSON.stringify([source, options])`, so the serialized source
 * is an exact prefix. This avoids parsing the whole id, options included.
 */
function isQueryStateKeyForCollection(queryId: string, collectionName: string) {
  return queryId.startsWith(`[${JSON.stringify(`${collectionName}-first`)},`)
    || queryId.startsWith(`[${JSON.stringify(`${collectionName}-many`)},`)
}

/** Forget every saved page and the metadata of one query id. */
export function deleteQueryState(ctx: CacheRuntime, queryId: string): void {
  for (const pageId of ctx.state.pageRefs.keys()) {
    if (getPageQueryId(pageId) === queryId) {
      ctx.state.pageRefs.delete(pageId)
    }
  }
  delete ctx.state.queryMeta[queryId]
  forgetQueryStateBookkeeping(ctx, queryId)
}

/**
 * Forget write generations no saved miss reads anymore.
 *
 * A key's generation only serves absence decisions of its saved misses, so
 * it can go once those misses are evicted.
 */
export function pruneItemWrites(ctx: CacheRuntime): void {
  const collections = itemWrites.get(ctx.state)
  if (!collections) {
    return
  }
  /** Keys of saved misses, by collection. */
  const missedKeys = new Map<string, Set<string>>()
  const collectionNames = [...collections.keys()]
  for (const [pageId, saved] of ctx.state.pageRefs) {
    const queryId = getPageQueryId(pageId)
    const collectionName = queryId && collectionNames.find(name => isQueryStateKeyForCollection(queryId, name))
    if (!collectionName || saved.type !== 'data' || saved.key == null) {
      continue
    }
    let keys = missedKeys.get(collectionName)
    if (!keys) {
      keys = new Set()
      missedKeys.set(collectionName, keys)
    }
    keys.add(String(saved.key))
  }
  for (const [collectionName, versions] of collections) {
    const kept = missedKeys.get(collectionName)
    for (const key of versions.keys()) {
      if (!kept?.has(key)) {
        versions.delete(key)
      }
    }
  }
}
