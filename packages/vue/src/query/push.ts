import type { CustomHookMeta, FieldTimestampValue, SetResultOutcome } from '@rstore/shared'
import type { VueQueryPage } from './types'
import { klona } from 'klona'
import { createTrackingObject } from '../trackingRelations'
import { equalFindOptions, toSerializableOptions } from './options'
import { applyPageResult, getPageOptions, isCurrentPageRequest } from './page'
import { getMainPagePublicationRelease, waitForMainPagePublication } from './publication'
import { isStalePageResult, markVersionedPush, reconcilePageTracking, reservePageResult, updateQueryMeta } from './result'
import { capturePageFetches, completePageFromPush } from './state'
import { assertPushVersion } from './version'

/** Unversioned pushes supersede every older queued push, independently of fetches. */
const unversionedPushes = new WeakMap<object, number>()

/** Publish parsed server rows, superseding transport work without writing items. */
export function publishPageResult(ctx: any, page: VueQueryPage<any, any, any, any, any>, result: any, meta?: CustomHookMeta, version?: FieldTimestampValue): SetResultOutcome {
  assertPushVersion(version)
  if (ctx.disposed || ctx.isDisabled() || !ctx.pages.value.includes(page))
    return 'inactive'
  if (isStalePageResult(page, version))
    return 'stale'
  // Versioned replies may describe a newer snapshot even when their fetch
  // started before this push. Keep their request ownership until they answer;
  // an unversioned reply to that request is dropped as stale.
  if (version != null)
    markVersionedPush(page)
  const requestId = version == null ? page.requestId = crypto.randomUUID() : page.requestId
  const pushRevision = (unversionedPushes.get(page) ?? 0) + (version == null ? 1 : 0)
  unversionedPushes.set(page, pushRevision)
  // Inline callbacks are rebuilt on every options read; compare without them.
  const pageOptions = toSerializableOptions(getPageOptions(ctx, page))
  // Resolving defaults can merge initial option metadata; preserve published values.
  const options = ctx.store.$resolveFindOptions(ctx.getCollection(), getPageOptions(ctx, page), ctx.many, { ...ctx.meta.value })
  // Resolve the current page options, including refresh overrides and defaults.
  const fetchPolicy = options.fetchPolicy
  const confirmationOptions = klona(options)
  /** A same-options fetch retry does not invalidate an accepted server version. */
  function isCurrent(): boolean {
    return !ctx.disposed && !ctx.isDisabled() && ctx.pages.value.includes(page)
      && unversionedPushes.get(page) === pushRevision
      && (version == null ? isCurrentPageRequest(ctx, page, requestId) : equalFindOptions(pageOptions, getPageOptions(ctx, page)))
  }
  // Reserve before the main-page wait: a lower-version fetch must not overwrite
  // the connector's already-cached pushed fields while publication is queued.
  const release = version == null ? undefined : reservePageResult(page, version, isCurrent)
  const tracksPage = ctx.queryTrackingEnabled && fetchPolicy !== 'no-cache'
  // A queued push owns its rows from acceptance: another owner's release must
  // not collect them before the main page lets this push publish.
  const unpin = page.main ? undefined : pinPushedRows(ctx, page, tracksPage ? readTrackingResult(ctx, result) : undefined, options)
  /** Recheck ownership after a main-page wait before publishing any state. */
  function publish(): void {
    let fetches: Array<() => void> = []
    try {
      if (!isCurrent() || isStalePageResult(page, version))
        return
      const publishingRequestId = page.requestId
      fetches = capturePageFetches(page)
      const releaseMain = page.main ? getMainPagePublicationRelease(ctx) : undefined
      /** Reactive writes can synchronously replace the request or dispose its scope. */
      const ownsPublication = applyPageResult(ctx, page, result, fetchPolicy, version, true, confirmationOptions, () => isCurrent() && page.requestId === publishingRequestId)
      if (!ownsPublication())
        return
      updateQueryMeta(ctx, page, { ...ctx.meta.value, ...meta }, ownsPublication)
      if (!ownsPublication())
        return
      const trackingResult = tracksPage ? readTrackingResult(ctx, result) : undefined
      reconcilePageTracking(ctx, page, trackingResult, { ...options, fetchPolicy }, tracksPage ? createTrackingObject() : undefined, ownsPublication)
      if (!ownsPublication())
        return
      completePageFromPush(ctx, page, fetches, ownsPublication)
      if (ownsPublication())
        releaseMain?.()
    }
    finally {
      // Publication may have started a replacement request. Release only the
      // pre-push slots even when its remaining side effects lost ownership.
      for (const detach of fetches)
        detach()
      release?.()
      // Published rows are owned by the page now; dropped ones are released.
      unpin?.()
    }
  }
  // The callback returns acceptance synchronously; non-main pages publish only
  // once the main page has settled, with the same stale-request check as fetches.
  if (!page.main)
    void waitForMainPagePublication(ctx).then(publish).catch(error => console.error(error))
  else publish()
  return 'applied'
}

/**
 * Resolve plain wire rows to their already-written cache wrappers, so tracking
 * also follows the relations selected by the page's include.
 */
function readTrackingResult(ctx: any, result: any): any {
  /** Resolve one wire row to its cache wrapper. */
  const cached = (item: any) => item && ctx.store.$cache.readItem({ collection: ctx.getCollection(), key: ctx.getCollection().getKey(item) })
  return Array.isArray(result) ? result.map(cached).filter(Boolean) : cached(result)
}

/**
 * Retain a queued push's rows under a dedicated tracking id until it settles.
 * The page's own ownership is untouched, so the rows it still shows stay owned
 * too. Releasing after publication keeps rows the page now tracks.
 */
function pinPushedRows(ctx: any, page: VueQueryPage<any, any, any, any, any>, trackingResult: any, options: any): (() => void) | undefined {
  if (!ctx.queryTracking || trackingResult === undefined)
    return undefined
  const pinId = `${page.id}:push:${crypto.randomUUID()}`
  ctx.queryTracking.handleQueryTracking(pinId, createTrackingObject(), trackingResult, options.include, false)
  return () => ctx.queryTracking.releasePage(pinId, { collect: true })
}
