import type { CustomHookMeta, SetResultOptions, SetResultOutcome } from '@rstore/shared'
import type { VueQueryPage } from './types'
import { processQueryResult, wrapQueryResult } from '@rstore/core'
import { klona } from 'klona'
import { createTrackingObject } from '../trackingRelations'
import { equalFindOptions, toSerializableOptions } from './options'
import { applyPageResult, getPageOptions, isCurrentPageRequest } from './page'
import { getMainPagePublicationRelease, waitForMainPagePublication } from './publication'
import { beginPagePublication } from './publicationOwnership'
import { collectUnreconciledTracking, isStalePageResult, markVersionedPush, reconcilePageTracking, reservePageResult, updateQueryMeta, watchDeferredPageTracking } from './result'
import { capturePageFetches, completePageFromPush } from './state'
import { assertPushVersion } from './version'

/** Unversioned pushes supersede every older queued push, independently of fetches. */
const unversionedPushes = new WeakMap<object, number>()

/** Write accepted server rows and publish their page, superseding older transport work. */
export function publishPageResult(ctx: any, page: VueQueryPage<any, any, any, any, any>, result: any, resultOptions: SetResultOptions = {}): SetResultOutcome {
  const { meta, version } = resultOptions
  assertPushVersion(version)
  if (ctx.disposed || ctx.isDisabled() || !ctx.pages.value.includes(page))
    return 'inactive'
  if (isStalePageResult(page, version))
    return 'stale'
  // Detach at acceptance: parsing and a main-page wait must never mutate or
  // retain connector-owned rows or their index-aligned timestamp array.
  result = klona(result)
  const fieldTimestamps = klona(resultOptions.fieldTimestamps)
  const rowCount = ctx.many ? result?.length ?? 0 : result == null ? 0 : 1
  // eslint-disable-next-line node/prefer-global/process -- Bundlers replace NODE_ENV; a node:process import would require a browser polyfill.
  if (process.env.NODE_ENV !== 'production' && Array.isArray(fieldTimestamps) && fieldTimestamps.length !== rowCount)
    console.warn(`[rstore] fieldTimestamps length must match result rows (received ${fieldTimestamps.length} timestamps for ${rowCount} rows).`)
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
  // Reserve before the main-page wait so older fetches cannot write a result
  // that the accepted queued snapshot already superseded.
  const release = version == null ? undefined : reservePageResult(page, version, isCurrent)
  const tracksPage = ctx.queryTrackingEnabled && fetchPolicy !== 'no-cache'
  /** Recheck ownership after a main-page wait before publishing any state. */
  function publish(): void {
    let fetches: Array<() => void> = []
    const tracking = tracksPage ? createTrackingObject() : undefined
    let published = false
    try {
      if (!isCurrent() || isStalePageResult(page, version))
        return
      const publishingRequestId = page.requestId
      fetches = capturePageFetches(page)
      const releaseMain = page.main ? getMainPagePublicationRelease(ctx) : undefined
      // Establish ownership before parsing or cache writes: either can trigger
      // synchronous observers that publish again or dispose this consumer.
      const ownsPublication = beginPagePublication(page, () => isCurrent() && page.requestId === publishingRequestId)
      const writeMeta: CustomHookMeta = { ...ctx.meta.value, ...meta, $queryTracking: tracking, $canPublishQuery: ownsPublication }
      const parsed = processQueryResult({ store: ctx.store, collection: ctx.getCollection(), result, many: ctx.many, findOptions: options, meta: writeMeta, fieldTimestamps })
      if (!ownsPublication())
        return
      const pageResult = wrapQueryResult({ store: ctx.store, collection: ctx.getCollection(), result: parsed, many: ctx.many, noCache: fetchPolicy === 'no-cache' })
      applyPageResult(ctx, page, pageResult, fetchPolicy, version, true, confirmationOptions, ownsPublication, ownsPublication)
      if (!ownsPublication())
        return
      updateQueryMeta(ctx, page, { ...ctx.meta.value, ...meta }, ownsPublication)
      if (!ownsPublication())
        return
      const trackingResult = tracksPage ? pageResult : undefined
      reconcilePageTracking(ctx, page, trackingResult, { ...options, fetchPolicy }, tracking, ownsPublication)
      if (!ownsPublication())
        return
      if (tracking)
        watchDeferredPageTracking(ctx, page, options, tracking, writeMeta, ownsPublication)
      published = true
      completePageFromPush(ctx, page, fetches, ownsPublication)
      if (ownsPublication())
        releaseMain?.()
    }
    finally {
      // Publication may have started a replacement request. Release only the
      // pre-push slots even when its remaining side effects lost ownership.
      for (const detach of fetches)
        detach()
      if (!published)
        collectUnreconciledTracking(ctx, tracking)
      release?.()
    }
  }
  // The callback returns acceptance synchronously; non-main pages publish only
  // once the main page has settled, with the same stale-request check as fetches.
  if (!page.main)
    void waitForMainPagePublication(ctx).then(publish).catch(error => console.error(error))
  else publish()
  return 'applied'
}
