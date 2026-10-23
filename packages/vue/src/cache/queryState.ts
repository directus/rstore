import type { CacheRuntime } from './types'

/**
 * Drop query metadata and page refs that target one collection.
 */
export function clearQueryStateForCollection(ctx: CacheRuntime, collectionName: string) {
  for (const queryId of Object.keys(ctx.state.queryMeta)) {
    if (isQueryStateKeyForCollection(queryId, collectionName)) {
      delete ctx.state.queryMeta[queryId]
    }
  }

  for (const pageId of ctx.state.pageRefs.keys()) {
    const queryId = getPageQueryId(pageId)
    if (queryId && isQueryStateKeyForCollection(queryId, collectionName)) {
      ctx.state.pageRefs.delete(pageId)
    }
  }
}

/**
 * Drop all query metadata and page refs.
 */
export function clearAllQueryState(ctx: CacheRuntime) {
  ctx.state.queryMeta = {}
  ctx.state.pageRefs.clear()
}

/**
 * Drop response references to one evicted item without disturbing other pages
 * or query metadata.
 */
export function invalidatePageRefsForItem(ctx: CacheRuntime, collectionName: string, key: string | number): void {
  for (const [pageId, ref] of ctx.state.pageRefs) {
    const queryId = getPageQueryId(pageId)
    if (!queryId || !isQueryStateKeyForCollection(queryId, collectionName)) {
      continue
    }
    const keys = ref.type === 'ref' ? [ref.key] : ref.keys
    if (keys.some(candidate => String(candidate) === String(key))) {
      ctx.state.pageRefs.delete(pageId)
    }
  }
}

/**
 * Extract the serialized query id from a page id.
 */
function getPageQueryId(pageId: string) {
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
