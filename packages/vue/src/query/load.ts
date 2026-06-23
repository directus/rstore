import type { CustomHookMeta, FindOptions } from '@rstore/shared'
import type { VueQueryPage } from './types'
import { pickNonSpecialProps } from '@rstore/shared'
import { setPageResult } from './page'

/**
 * Load a query page from cache or fetcher.
 */
export async function loadPage(
  ctx: any,
  page: VueQueryPage<any, any, any, any, any>,
  forceFetch: boolean,
) {
  page.completed = false
  if (ctx.isDisabled()) {
    return { page }
  }

  ctx.loadingCount.value++
  ctx.error.value = null
  page.loading = true
  page.error = null
  const savedPageRequestId = page.requestId
  const newQueryTracking = ctx.queryTracking?.createTrackingObject()
  let shouldHandleQueryTracking = true

  try {
    const finalOptions = await resolvePageOptions(ctx, page, forceFetch, savedPageRequestId)
    if (finalOptions) {
      await fetchPage(ctx, page, savedPageRequestId, finalOptions, newQueryTracking, shouldHandleQueryTracking)
    }
  }
  catch (e: any) {
    ctx.error.value = e
    page.error = e
    console.error(e)
  }
  finally {
    ctx.loadingCount.value--
    if (page.requestId === savedPageRequestId && ctx.pages.value.includes(page)) {
      page.completed = true
    }
    page.loading = false
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
  ctx.fetchMethod({ ...finalOptions, fetchPolicy: 'fetch-only' }, fetchMeta).then(async (backgroundResult: any) => {
    const { valid } = await setPageResult(ctx, page, savedPageRequestId, backgroundResult)
    if (!valid)
      return
    updateQueryMeta(ctx, page, fetchMeta)
    if (ctx.queryTracking && newQueryTracking) {
      ctx.queryTracking.handleQueryTracking(page.id, newQueryTracking, undefined, finalOptions.include, page.main)
    }
  })
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
