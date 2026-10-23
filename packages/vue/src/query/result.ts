import type { CustomHookMeta, FieldTimestampValue, FindOptions } from '@rstore/shared'
import type { VueQueryPage } from './types'
import { compareHLC } from '@rstore/core'
import { pickNonSpecialProps } from '@rstore/shared'
import { nextTick } from 'vue'

/** Accepted versioned push that has not yet passed the main-page barrier. */
interface PendingPageResult {
  /** Server version reserved before a competing fetch can write cache rows. */
  version: FieldTimestampValue
  /** Whether the page still represents the options that accepted this push. */
  isCurrent: () => boolean
}

/** Weak page ownership avoids retaining abandoned query scopes. */
const pendingPageResults = new WeakMap<object, PendingPageResult>()

/** Reserve a queued snapshot until it publishes or loses its page ownership. */
export function reservePageResult(page: VueQueryPage<any, any, any, any, any>, version: FieldTimestampValue, isCurrent: () => boolean): () => void {
  const pending = { version, isCurrent }
  pendingPageResults.set(page, pending)
  return () => {
    if (pendingPageResults.get(page) === pending)
      pendingPageResults.delete(page)
  }
}

/**
 * Store hook metadata for the main page.
 */
export function updateQueryMeta(ctx: any, page: VueQueryPage<any, any, any, any, any>, newMeta: CustomHookMeta, isCurrent: () => boolean = () => true) {
  if (page.main) {
    ctx.cache._private.state.queryMeta[ctx.queryId.value] = pickNonSpecialProps(newMeta)
  }
  if (!isCurrent())
    return
  // The publication check belongs to this fetch and its queued cache writes,
  // not to metadata a consumer may later reuse for an unrelated mutation.
  const publishedMeta = { ...newMeta }
  delete publishedMeta.$canPublishQuery
  delete publishedMeta.$resultVersion
  ctx.meta.value = publishedMeta
}

/**
 * Release pages discarded by an option change only after a replacement page
 * owns its visible rows. This prevents an intervening Vue tick from evicting
 * a cache-hit result before skipped metadata can seed ownership.
 */
export function releaseDiscardedPageOwnership(ctx: any): void {
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
export function getTrackingResult(page: VueQueryPage<any, any, any, any, any>, result: unknown): any {
  return Array.isArray(result) && result.length === 0 ? result : page.data
}

/**
 * Sweep rows written by a stale request that never reached page reconciliation.
 *
 * Another live query may have adopted a row before this turn, so the public
 * collector remains the authority for whether an unowned row can disappear.
 */
export function collectUnreconciledTracking(ctx: any, tracking: any): void {
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

/** Reconcile cache ownership after either a fetch or a server push. */
export function reconcilePageTracking(
  ctx: any,
  page: VueQueryPage<any, any, any, any, any>,
  result: unknown,
  options: FindOptions<any, any, any>,
  tracking: any,
  isCurrent: () => boolean = () => true,
): void {
  if (options.fetchPolicy === 'no-cache') {
    ctx.queryTracking?.releasePage(page.id, { collect: true })
  }
  else if (ctx.queryTrackingEnabled && ctx.queryTracking && tracking) {
    ctx.queryTracking.handleQueryTracking(page.id, tracking, result, options.include, true)
    if (isCurrent())
      releaseDiscardedPageOwnership(ctx)
  }
}

/** Request each page owned when it accepted its latest versioned push. */
const versionedPushRequests = new WeakMap<object, string>()

/**
 * Record that a versioned push was accepted while the page's current request
 * was in flight. The push keeps that request current so a newer versioned
 * answer can still win, but an unversioned answer cannot be ordered against
 * the push and is dropped instead.
 */
export function markVersionedPush(page: VueQueryPage<any, any, any, any, any>): void {
  versionedPushRequests.set(page, page.requestId)
}

/**
 * Compare page snapshots with the same comparator used for item timestamps.
 *
 * @param page Page receiving the result.
 * @param version Version of the result; unversioned results are not compared.
 * @param requestId Fetch request delivering the result; an unversioned fetch
 * started before an accepted versioned push is stale.
 */
export function isStalePageResult(page: VueQueryPage<any, any, any, any, any>, version?: FieldTimestampValue, requestId?: string): boolean {
  if (version == null)
    return requestId != null && versionedPushRequests.get(page) === requestId
  const pending = pendingPageResults.get(page)
  return (page._resultVersion != null && compareHLC(version, page._resultVersion) < 0)
    || (pending?.isCurrent() === true && compareHLC(version, pending.version) < 0)
}
