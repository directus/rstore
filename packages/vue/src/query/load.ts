import type { CustomHookMeta, FindOptions } from '@rstore/shared'
import type { PruneRun } from './prune'
import type { VueQueryPage } from './types'
import { createTrackingObject } from '../trackingRelations'
import { rememberPageAbsence } from './absence'
import { capturePageConfirmation, getMatchingPageRefs, preparePageConfirmation, readFetchConfirmation } from './confirmation'
import { isCurrentPageRequest, markPagesAsComputed, setPageResult } from './page'
import { recordPrunedFetch } from './prune'
import { beginPagePublication } from './publicationOwnership'
import { collectUnreconciledTracking, createPageFetchPublication, getTrackingResult, reconcilePageTracking, releaseDiscardedPageOwnership, updateQueryMeta } from './result'
import { startPageFetch } from './state'
import { readFetchVersion } from './version'

/**
 * Load a query page from cache or fetcher.
 *
 * @param ctx Query context owning the page.
 * @param page Page to load.
 * @param forceFetch Whether the cache must be bypassed.
 * @param pruneRun Set by `refresh({ prune: true })` to collect what the fetch returned.
 */
export async function loadPage(
  ctx: any,
  page: VueQueryPage<any, any, any, any, any>,
  forceFetch: boolean,
  pruneRun?: PruneRun,
) {
  preparePageConfirmation(ctx, page)
  page._foreground.markIncomplete()
  if (ctx.isDisabled()) {
    return { page }
  }

  const finish = startPageFetch(ctx, page)
  // A new blocking load is authoritative, so it also drops any stale background failure.
  ctx.background.clearError()
  page._background.clearError()

  const savedPageRequestId = page.requestId
  const newQueryTracking = ctx.queryTracking?.createTrackingObject()
  let caughtError: Error | null = null
  let published = false

  try {
    const finalOptions = await resolvePageOptions(ctx, page, forceFetch, savedPageRequestId)
    // Even a cache hit must not acquire ownership after the consumer stops.
    if (finalOptions && isCurrentPageRequest(ctx, page, savedPageRequestId)) {
      published = await fetchPage(ctx, page, savedPageRequestId, finalOptions, newQueryTracking, pruneRun)
    }
  }
  catch (e: any) {
    caughtError = e
  }
  finally {
    const current = isCurrentPageRequest(ctx, page, savedPageRequestId)
    finish({ error: caughtError, current, published })
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
  pruneRun: PruneRun | undefined,
) {
  // A no-cache page displays rows the cache does not hold, so it can neither
  // own them nor be represented by them.
  const uncachedPage = finalOptions.fetchPolicy === 'no-cache'
  const tracksPage = ctx.queryTrackingEnabled && ctx.queryTracking && newQueryTracking && !uncachedPage
  const cached = !uncachedPage && finalOptions.fetchPolicy !== 'fetch-only' ? getMatchingPageRefs(ctx, page) : undefined
  const ownsCachePublication = beginPagePublication(page, () => isCurrentPageRequest(ctx, page, savedPageRequestId))
  if (cached) {
    page._confirmed ||= finalOptions.fetchPolicy !== 'cache-only' && cached.confirmed === true
    if (!ownsCachePublication())
      return false
  }
  // A local write changes computed membership, not whether these options were
  // confirmed. Read current cache data while retaining the saved confirmation.
  if (cached && (cached.type !== 'data' || !cached.invalidated)) {
    page.rawData = cached
    // Serving saved results makes this query their live consumer: retention
    // must not evict them while it stays mounted.
    ctx.cache._private.holdQueryState(ctx.queryId.value, ctx)
    if (!ownsCachePublication())
      return false
    rememberPageAbsence(ctx, page)
    page._fetchPolicy = finalOptions.fetchPolicy ?? null
    if (!ownsCachePublication())
      return false
    markPagesAsComputed(ctx, ownsCachePublication)
    if (tracksPage && ownsCachePublication()) {
      newQueryTracking.skipped = true
      ctx.queryTracking.handleQueryTracking(page.id, newQueryTracking, page.data, finalOptions.include, true)
      if (ownsCachePublication())
        releaseDiscardedPageOwnership(ctx)
    }
    return ownsCachePublication()
  }

  // Pruning needs the written identities even without ownership. That payload
  // stays out of the ownership paths below, which only see `newQueryTracking`.
  // A non-collecting query still owns its result, but pruning must retain a
  // separate payload for writes that can remain queued after publication.
  const hookTracking = pruneRun && !ctx.queryCollectionEnabled && !uncachedPage
    ? createTrackingObject()
    : tracksPage ? newQueryTracking : pruneRun && !uncachedPage ? createTrackingObject() : undefined
  const publication = createPageFetchPublication(ctx, page, savedPageRequestId)
  const fetchMeta: CustomHookMeta = {
    ...ctx.meta.value,
    $canPublishQuery: responseMeta => publication.canPublish(responseMeta ?? fetchMeta),
    $queryTracking: hookTracking,
  }
  try {
    const confirmationOptions = capturePageConfirmation(ctx, page)
    const pageResult = await ctx.fetchMethod(finalOptions, fetchMeta)
    const { isCurrent } = await setPageResult(ctx, page, savedPageRequestId, pageResult, finalOptions.fetchPolicy, readFetchVersion(fetchMeta), readFetchConfirmation(fetchMeta) ?? finalOptions.fetchPolicy !== 'cache-only', confirmationOptions)
    if (!isCurrent()) {
      collectUnreconciledTracking(ctx, newQueryTracking)
      return false
    }
    updateQueryMeta(ctx, page, fetchMeta, isCurrent)
    if (!isCurrent()) {
      collectUnreconciledTracking(ctx, newQueryTracking)
      return false
    }
    // A no-cache result says nothing about the cache: left unrecorded, it cancels the prune.
    if (pruneRun && !uncachedPage) {
      recordPrunedFetch(pruneRun, hookTracking, pageResult, finalOptions.include, hookTracking === newQueryTracking, isCurrent)
    }
    reconcilePageTracking(ctx, page, tracksPage ? getTrackingResult(page, pageResult) : undefined, finalOptions, tracksPage ? newQueryTracking : undefined, isCurrent)
    return isCurrent()
  }
  finally {
    publication.release()
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
  const publication = createPageFetchPublication(ctx, page, savedPageRequestId)
  const fetchMeta: CustomHookMeta = {
    ...ctx.meta.value,
    $canPublishQuery: responseMeta => publication.canPublish(responseMeta ?? fetchMeta),
    $queryTracking: newQueryTracking,
  }

  const settle = startPageFetch(ctx, page, true)

  /**
   * Publish the outcome on the background lane only, so a failed silent refresh stays
   * distinguishable from a failed blocking load.
   */
  function finish(error: Error | null, published = false) {
    const current = isCurrentPageRequest(ctx, page, savedPageRequestId)
    settle({ error, current, published })
    if (error && current) {
      console.error(error)
    }
  }

  // Wrapped in an async function so a rejection coming from the fetch itself and one coming
  // from the result handling (`setPageResult`, `updateQueryMeta`) are both handled below.
  // `then(onFulfilled, onRejected)` keeps the chain from ever rejecting.
  void (async () => {
    try {
      const confirmationOptions = capturePageConfirmation(ctx, page)
      const backgroundResult = await ctx.fetchMethod({ ...finalOptions, fetchPolicy: 'fetch-only' }, fetchMeta)
      const { isCurrent } = await setPageResult(ctx, page, savedPageRequestId, backgroundResult, 'fetch-only', readFetchVersion(fetchMeta), true, confirmationOptions)
      if (!isCurrent()) {
        collectUnreconciledTracking(ctx, newQueryTracking)
        return false
      }
      updateQueryMeta(ctx, page, fetchMeta, isCurrent)
      if (!isCurrent()) {
        collectUnreconciledTracking(ctx, newQueryTracking)
        return false
      }
      reconcilePageTracking(ctx, page, newQueryTracking ? getTrackingResult(page, backgroundResult) : undefined, finalOptions, newQueryTracking, isCurrent)
      return isCurrent()
    }
    finally {
      publication.release()
    }
  })().then(published => finish(null, published), (e: any) => finish(e))
}
