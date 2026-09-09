import type { CustomHookMeta, FindOptions } from '@rstore/shared'
import type { VueQueryPage } from './types'
import { pickNonSpecialProps } from '@rstore/shared'
import { nextTick } from 'vue'
import { isCurrentPageRequest, setPageResult } from './page'

/**
 * Load a query page from cache or fetcher.
 */
export async function loadPage(
  ctx: any,
  page: VueQueryPage<any, any, any, any, any>,
  forceFetch: boolean,
) {
  page._foreground.markIncomplete()
  if (ctx.isDisabled()) {
    return { page }
  }

  ctx.foreground.start()
  page._foreground.start()
  // A new blocking load is authoritative, so it also drops any stale background failure.
  ctx.background.clearError()
  page._background.clearError()

  const savedPageRequestId = page.requestId
  const newQueryTracking = ctx.queryTracking?.createTrackingObject()
  let caughtError: Error | null = null

  try {
    const finalOptions = await resolvePageOptions(ctx, page, forceFetch, savedPageRequestId)
    // Even a cache hit must not acquire ownership after the consumer stops.
    if (finalOptions && isCurrentPageRequest(ctx, page, savedPageRequestId)) {
      await fetchPage(ctx, page, savedPageRequestId, finalOptions, newQueryTracking)
    }
  }
  catch (e: any) {
    caughtError = e
  }
  finally {
    const current = isCurrentPageRequest(ctx, page, savedPageRequestId)
    ctx.foreground.settle({ error: caughtError, current })
    page._foreground.settle({ error: caughtError, current })
    if (caughtError && current) {
      console.error(caughtError)
    }
  }
  return { page }

  async function resolvePageOptions(ctx: any, page: VueQueryPage<any, any, any, any, any>, forceFetch: boolean, savedPageRequestId: string) {
    const finalOptions = ctx.getPageOptions(page)
    const resolvedOptions = ctx.store.$resolveFindOptions(ctx.getCollection(), finalOptions, ctx.many, ctx.meta.value)
    const currentFetchPolicy = finalOptions.fetchPolicy = resolvedOptions.fetchPolicy
    const currentResultMode = finalOptions.resultMode = resolvedOptions.resultMode

    if (page.main) {
      ctx.fetchPolicy = currentFetchPolicy
      ctx.resultMode = currentResultMode
    }
    ctx.updateQueryTrackingMode()
    if (!forceFetch && currentFetchPolicy === 'cache-and-fetch') {
      fetchCacheAndFetchBackground(ctx, page, savedPageRequestId, finalOptions)
      finalOptions.fetchPolicy = 'cache-only'
    }
    if (forceFetch) {
      finalOptions.fetchPolicy = currentFetchPolicy === 'no-cache' ? 'no-cache' : 'fetch-only'
    }
    return finalOptions
  }
}

/**
 * Fetch a page and store its result.
 */
async function fetchPage(
  ctx: any,
  page: VueQueryPage<any, any, any, any, any>,
  savedPageRequestId: string,
  finalOptions: FindOptions<any, any, any>,
  newQueryTracking: any,
) {
  // A no-cache page displays rows the cache does not hold, so it can neither
  // own them nor be represented by them.
  const uncachedPage = finalOptions.fetchPolicy === 'no-cache'
  const tracksPage = ctx.queryTrackingEnabled && ctx.queryTracking && newQueryTracking && !uncachedPage
  if (!uncachedPage && finalOptions.fetchPolicy !== 'fetch-only' && ctx.cache._private.state.pageRefs.has(page.id)) {
    page.rawData = ctx.cache._private.state.pageRefs.get(page.id)!
    page._fetchPolicy = finalOptions.fetchPolicy ?? null
    if (tracksPage) {
      newQueryTracking.skipped = true
      ctx.queryTracking.handleQueryTracking(page.id, newQueryTracking, page.data, finalOptions.include, true)
      releaseDiscardedPageOwnership(ctx)
    }
    return
  }

  const fetchMeta: CustomHookMeta = {
    ...ctx.meta.value,
    $canPublishQuery: () => isCurrentPageRequest(ctx, page, savedPageRequestId),
    $queryTracking: tracksPage ? newQueryTracking : undefined,
  }
  const pageResult = await ctx.fetchMethod(finalOptions, fetchMeta)
  const { valid } = await setPageResult(ctx, page, savedPageRequestId, pageResult, finalOptions.fetchPolicy)
  if (!valid) {
    collectUnreconciledTracking(ctx, newQueryTracking)
    return
  }
  updateQueryMeta(ctx, page, fetchMeta)
  if (tracksPage) {
    ctx.queryTracking.handleQueryTracking(page.id, newQueryTracking, getTrackingResult(page, pageResult), finalOptions.include, true)
    releaseDiscardedPageOwnership(ctx)
  }
  else if (uncachedPage) {
    // The page may have owned cached rows before this load turned it uncached.
    ctx.queryTracking?.releasePage(page.id, { collect: true })
  }
}

/**
 * Start the background fetch half of `cache-and-fetch`.
 */
function fetchCacheAndFetchBackground(
  ctx: any,
  page: VueQueryPage<any, any, any, any, any>,
  savedPageRequestId: string,
  finalOptions: FindOptions<any, any, any>,
) {
  const newQueryTracking = ctx.queryTrackingEnabled ? ctx.queryTracking?.createTrackingObject() : undefined
  const fetchMeta: CustomHookMeta = {
    ...ctx.meta.value,
    $canPublishQuery: () => isCurrentPageRequest(ctx, page, savedPageRequestId),
    $queryTracking: newQueryTracking,
  }

  ctx.background.start()
  page._background.start()

  /**
   * Publish the outcome on the background lane only, so a failed silent refresh stays
   * distinguishable from a failed blocking load.
   */
  function finish(error: Error | null) {
    const current = isCurrentPageRequest(ctx, page, savedPageRequestId)
    ctx.background.settle({ error, current })
    page._background.settle({ error, current })
    if (error && current) {
      console.error(error)
    }
  }

  // Wrapped in an async function so a rejection coming from the fetch itself and one coming
  // from the result handling (`setPageResult`, `updateQueryMeta`) are both handled below.
  // `then(onFulfilled, onRejected)` keeps the chain from ever rejecting.
  void (async () => {
    const backgroundResult = await ctx.fetchMethod({ ...finalOptions, fetchPolicy: 'fetch-only' }, fetchMeta)
    const { valid } = await setPageResult(ctx, page, savedPageRequestId, backgroundResult, 'fetch-only')
    if (!valid) {
      collectUnreconciledTracking(ctx, newQueryTracking)
      return
    }
    updateQueryMeta(ctx, page, fetchMeta)
    if (ctx.queryTracking && newQueryTracking) {
      ctx.queryTracking.handleQueryTracking(page.id, newQueryTracking, getTrackingResult(page, backgroundResult), finalOptions.include, true)
      releaseDiscardedPageOwnership(ctx)
    }
  })().then(() => finish(null), (e: any) => finish(e))
}

/**
 * Store hook metadata for the main page.
 */
function updateQueryMeta(ctx: any, page: VueQueryPage<any, any, any, any, any>, newMeta: CustomHookMeta) {
  if (page.main) {
    ctx.cache._private.state.queryMeta[ctx.queryId.value] = pickNonSpecialProps(newMeta)
  }
  // The publication check belongs to this fetch and its queued cache writes,
  // not to metadata a consumer may later reuse for an unrelated mutation.
  const publishedMeta = { ...newMeta }
  delete publishedMeta.$canPublishQuery
  ctx.meta.value = publishedMeta
}

/**
 * Release pages discarded by an option change only after a replacement page
 * owns its visible rows. This prevents an intervening Vue tick from evicting
 * a cache-hit result before skipped metadata can seed ownership.
 */
function releaseDiscardedPageOwnership(ctx: any): void {
  for (const pageId of ctx.pendingTrackingPageIds.splice(0)) {
    // Function-only option changes can reuse the serialized page id. Its
    // replacement already reconciled ownership, so only release absent pages.
    if (ctx.pages.value.some((page: VueQueryPage<any, any, any, any, any> | undefined) => page?.id === pageId)) {
      continue
    }
    ctx.queryTracking?.releasePage(pageId, { collect: true })
  }
}

/**
 * Preserve an authoritative empty response while computed pages still expose
 * cache slices from the previous result.
 */
function getTrackingResult(page: VueQueryPage<any, any, any, any, any>, result: unknown): any {
  return Array.isArray(result) && result.length === 0 ? result : page.data
}

/**
 * Sweep rows written by a stale request that never reached page reconciliation.
 *
 * Another live query may have adopted a row before this turn, so the public
 * collector remains the authority for whether an unowned row can disappear.
 */
function collectUnreconciledTracking(ctx: any, tracking: any): void {
  if (!tracking) {
    return
  }
  nextTick(() => {
    for (const [collectionName, keys] of Object.entries(tracking.items) as Array<[string, Set<string | number>]>) {
      const collection = ctx.store.$collections.find((candidate: any) => candidate.name === collectionName)
      if (!collection) {
        continue
      }
      for (const key of keys) {
        const item = ctx.store.$cache.readItem({ collection, key })
        if (item) {
          ctx.store.$cache.garbageCollectItem({ collection, item })
        }
      }
    }
  })
}
