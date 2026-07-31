import type { CustomHookMeta, FindOptions } from '@rstore/shared'
import type { VueQueryPage } from './types'
import { pickNonSpecialProps } from '@rstore/shared'
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
  let shouldHandleQueryTracking = true
  let caughtError: Error | null = null

  try {
    const finalOptions = await resolvePageOptions(ctx, page, forceFetch, savedPageRequestId)
    if (finalOptions) {
      await fetchPage(ctx, page, savedPageRequestId, finalOptions, newQueryTracking, shouldHandleQueryTracking)
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
    if (!forceFetch && currentFetchPolicy === 'cache-and-fetch') {
      shouldHandleQueryTracking = false
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
  shouldHandleQueryTracking: boolean,
) {
  if (finalOptions.fetchPolicy !== 'no-cache' && finalOptions.fetchPolicy !== 'fetch-only' && ctx.cache._private.state.pageRefs.has(page.id)) {
    page.rawData = ctx.cache._private.state.pageRefs.get(page.id)!
    return
  }

  const fetchMeta: CustomHookMeta = {
    ...ctx.meta.value,
    $queryTracking: ctx.queryTrackingEnabled ? newQueryTracking : undefined,
  }
  const pageResult = await ctx.fetchMethod(finalOptions, fetchMeta)
  const { valid } = await setPageResult(ctx, page, savedPageRequestId, pageResult)
  if (!valid)
    return
  updateQueryMeta(ctx, page, fetchMeta)
  if (ctx.queryTrackingEnabled && shouldHandleQueryTracking && ctx.queryTracking && newQueryTracking) {
    ctx.queryTracking.handleQueryTracking(page.id, newQueryTracking, undefined, finalOptions.include, page.main)
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
  const newQueryTracking = ctx.queryTracking?.createTrackingObject()
  const fetchMeta: CustomHookMeta = {
    ...ctx.meta.value,
    $queryTracking: ctx.queryTrackingEnabled ? newQueryTracking : undefined,
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
    const { valid } = await setPageResult(ctx, page, savedPageRequestId, backgroundResult)
    if (!valid)
      return
    updateQueryMeta(ctx, page, fetchMeta)
    if (ctx.queryTracking && newQueryTracking) {
      ctx.queryTracking.handleQueryTracking(page.id, newQueryTracking, undefined, finalOptions.include, page.main)
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
  ctx.meta.value = newMeta
}
