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
 */
function isQueryStateKeyForCollection(queryId: string, collectionName: string) {
  const querySource = readQuerySource(queryId)
  return querySource === `${collectionName}-first` || querySource === `${collectionName}-many`
}

/**
 * Read the query source from a serialized query id.
 */
function readQuerySource(queryId: string) {
  try {
    const parsed = JSON.parse(queryId)
    if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
      return parsed[0]
    }
  }
  catch {
    // Ignore malformed internal query ids. They cannot be matched safely.
  }
  return undefined
}
