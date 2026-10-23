import type { CachedPageRefs } from '../cache/types'
import type { VueQueryPage } from './types'
import { deepEqual } from 'fast-equals'
import { watch } from 'vue'
import { getCollectionClearVersion } from '../cache/queryState'
import { toSerializableOptions } from './options'

/**
 * Confirmation follows serializable effective options only: function options
 * (such as `filter`) are local cache-read callbacks, dropped from the JSON page
 * id and from SSR payloads. A function-only change, a remount or a hydration
 * with a new inline callback keeps confirmation and saved refs.
 */

/** Effective options under which a page's confirmation was last checked. */
interface ConfirmationOptions {
  /** Serialized page identity. */
  id: string
  /** Detached serializable effective options. */
  options: unknown
}

/**
 * Whether Core fetched a page rather than returning a cache guess, keyed by the
 * fetch metadata object. Kept off the public metadata type and payload.
 */
const fetchConfirmations = new WeakMap<object, boolean>()

/** Record whether the fetch owning `meta` reached the server. */
export function markFetchConfirmation(meta: object, confirmed: boolean): void {
  fetchConfirmations.set(meta, confirmed)
}

/** Read what {@link markFetchConfirmation} recorded for this fetch, if anything. */
export function readFetchConfirmation(meta: object): boolean | undefined {
  return fetchConfirmations.get(meta)
}

/** Last effective options for each page, without retaining disposed pages. */
const pageOptions = new WeakMap<VueQueryPage<any, any, any, any, any>, ConfirmationOptions>()

/** Resolve defaults and hook overrides without changing published query metadata. */
function getEffectiveOptions(ctx: any, page: Pick<VueQueryPage<any, any, any, any, any>, 'options'>): unknown {
  return ctx.store.$resolveFindOptions(ctx.getCollection(), ctx.getPageOptions(page), ctx.many, { ...ctx.meta.value })
}

/** Detach requested options before transport awaits can observe newer defaults. */
export function capturePageConfirmation(ctx: any, page: Pick<VueQueryPage<any, any, any, any, any>, 'options'>): unknown {
  return toSerializableOptions(getEffectiveOptions(ctx, page))
}

/** Remember the effective options that produced newly saved page references. */
export function rememberPageConfirmation(ctx: any, page: VueQueryPage<any, any, any, any, any>, options = capturePageConfirmation(ctx, page)): void {
  const saved = ctx.cache._private.state.pageRefs.get(page.id) as CachedPageRefs | undefined
  // Persist defaults and page/refresh overrides omitted from the base query id.
  if (saved)
    saved.effectiveOptions = toSerializableOptions(options)
}

/** Resolve saved identities only after checking effective-option provenance. */
export function getMatchingPageRefs(ctx: any, page: Pick<VueQueryPage<any, any, any, any, any>, 'id' | 'options'>): CachedPageRefs | undefined {
  const saved = ctx.cache._private.state.pageRefs.get(page.id) as CachedPageRefs | undefined
  // Legacy refs lack provenance: fall back to an ordinary cache read rather
  // than trust identities saved for unknown options.
  return saved?.effectiveOptions !== undefined && deepEqual(saved.effectiveOptions, capturePageConfirmation(ctx, page)) ? saved : undefined
}

/** Invalidate confirmation when a load targets different effective options. */
export function preparePageConfirmation(ctx: any, page: VueQueryPage<any, any, any, any, any>): void {
  const options = capturePageConfirmation(ctx, page)
  const previous = pageOptions.get(page)
  if (ctx.isDisabled() || !previous || !deepEqual(previous.options, options)) {
    page._confirmed = false
    // Refresh overrides and defaults can change under a reused page id. Its
    // saved refs describe the previous options, not this cache guess.
    if (previous?.id === page.id) {
      ctx.cache._private.state.pageRefs.delete(page.id)
    }
    pageOptions.set(page, { id: page.id, options })
  }
}

/**
 * Whether a page's confirmation still describes its current options. Options
 * can change reactively before the watcher reloads the page; the page's cache
 * read already follows them, so its confirmation must drop at once too.
 */
export function isPageConfirmationCurrent(ctx: any, page: VueQueryPage<any, any, any, any, any>): boolean {
  if (ctx.isDisabled())
    return false
  const previous = pageOptions.get(page)
  // Pages confirmed without a load (for example a push) have no recorded options.
  return !previous || deepEqual(previous.options, capturePageConfirmation(ctx, page))
}

/**
 * Drop confirmation when the cache stops holding what the pages showed:
 * a full cache reset (which also refreshes) or a clear of the query's
 * collection (which leaves the next fetch or push to confirm again).
 */
export function installConfirmationResets(ctx: any, refresh: () => unknown): void {
  ctx.store.$onCacheReset(() => {
    for (const page of ctx.pages.value) {
      if (page)
        page._confirmed = false
    }
    return refresh()
  })
  watch(() => getCollectionClearVersion(ctx.cache._private.state, ctx.getCollection().name), () => {
    for (const page of ctx.pages.value) {
      // No-cache pages show server rows the cleared cache never held.
      if (page && page._fetchPolicy !== 'no-cache')
        page._confirmed = false
    }
  }, { flush: 'sync' })
}
