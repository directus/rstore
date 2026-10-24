import type { VueQueryPage } from './types'
import { isKeyDefined } from '@rstore/core'
import { rememberPageAbsence } from './absence'
import { rememberPageConfirmation } from './confirmation'

/**
 * Store a page value as cache references, or as plain data when the cache does
 * not hold it.
 *
 * @param ctx Query context owning the page.
 * @param page Page to represent.
 * @param value Value the page has to expose.
 * @param uncached Whether the value was obtained without writing to the cache.
 * @param confirmationOptions Requested effective options captured by the result owner.
 */
export function setPageRepresentation(ctx: any, page: VueQueryPage<any, any, any, any, any>, value: any, uncached: boolean, confirmationOptions?: unknown, isCurrent: () => boolean = () => true) {
  if (uncached) {
    page.rawData = { type: 'data', value }
  }
  else if (Array.isArray(value)) {
    page.rawData = { type: 'refs', keys: collectResultKeys(ctx, value) }
  }
  else if (value && typeof value === 'object') {
    setObjectPageResult(ctx, page, value)
  }
  else {
    page.rawData = { type: 'data', value }
  }
  if (!isCurrent())
    return

  // Saved refs are a response cache for remounts. Garbage collection may only
  // drop the ones no live consumer still represents.
  ctx.cache._private.holdQueryState(ctx.queryId.value, ctx)
  if (!uncached && page.rawData.type === 'data' && page.rawData.value === null) {
    // A confirmed not-found result has no keys but still survives SSR/remounts.
    const options = ctx.store.$resolveFindOptions(ctx.getCollection(), ctx.getPageOptions(page), ctx.many, { ...ctx.meta.value })
    ctx.cache._private.state.pageRefs.set(page.id, { type: 'data', value: null, confirmed: page.confirmed, key: options.key, resultMode: options.resultMode })
  }
  else if (page.rawData.type === 'ref' || page.rawData.type === 'refs') {
    ctx.cache._private.state.pageRefs.set(page.id, { ...page.rawData, confirmed: page.confirmed })
  }
  else {
    ctx.cache._private.state.pageRefs.delete(page.id)
  }
  if (!isCurrent())
    return
  rememberPageConfirmation(ctx, page, confirmationOptions)
  if (isCurrent())
    rememberPageAbsence(ctx, page)
}

/**
 * Collect primary keys from an array result.
 */
function collectResultKeys(ctx: any, pageResult: any[]) {
  const keys: Array<string | number> = []
  const collection = ctx.getCollection()
  for (const item of pageResult) {
    const key = collection.getKey(item)
    if (!isKeyDefined(key))
      console.warn(`[rstore] Item returned from query is missing primary key for collection "${collection.name}".`, item)
    else
      keys.push(key)
  }
  return keys
}

/**
 * Store an object result as a single ref when it has a key.
 */
function setObjectPageResult(ctx: any, page: VueQueryPage<any, any, any, any, any>, pageResult: any) {
  const collection = ctx.getCollection()
  const key = collection.getKey(pageResult)
  if (!isKeyDefined(key)) {
    console.warn(`[rstore] Item returned from query is missing primary key for collection "${collection.name}".`, pageResult)
    page.rawData = { type: 'data', value: pageResult }
  }
  else {
    page.rawData = { type: 'ref', key }
  }
}
