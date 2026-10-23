import type { FetchPolicy, FieldTimestampValue, FindOptions } from '@rstore/shared'
import type { VueQueryPage, VueQueryPageOptions } from './types'
import { shallowReactive, toValue } from 'vue'
import { readMissingPageResult, rememberPageAbsence } from './absence'
import { getMatchingPageRefs, isPageConfirmationCurrent } from './confirmation'
import { waitForMainPagePublication } from './publication'
import { beginPagePublication } from './publicationOwnership'
import { setPageRepresentation } from './representation'
import { isStalePageResult } from './result'
import { createFetchState, getFetchStateError, isFetchStateLoading, toPageFetchState } from './state'

/**
 * Create a query page object.
 */
export function createPage(
  ctx: any,
  optionsExtension: VueQueryPageOptions<FindOptions<any, any, any>>,
  main: boolean,
): VueQueryPage<any, any, any, any, any> {
  const index = optionsExtension.pageIndex != null ? optionsExtension.pageIndex : ctx.pages.value.length
  const id = getPageId(ctx, index)
  const cached = getMatchingPageRefs(ctx, { id, options: optionsExtension })
  const foreground = createFetchState()
  const background = createFetchState()
  const page = shallowReactive({
    id,
    requestId: crypto.randomUUID(),
    main,
    index,
    // Flat fields are derived from the lanes so there is a single source of truth.
    // Return types are explicit because `loading` reads `data`, which reads `page` back.
    get loading(): boolean {
      return isFetchStateLoading(foreground, background, () => page.data)
    },
    get completed() {
      return foreground.completed.value
    },
    get error() {
      return getFetchStateError(foreground, background)
    },
    foreground: toPageFetchState(foreground),
    background: toPageFetchState(background),
    _foreground: foreground,
    _background: background,
    options: optionsExtension,
    _refreshOptions: {},
    /** Server confirmation of the current page options. */
    get confirmed(): boolean {
      return page._confirmed && isPageConfirmationCurrent(ctx, page as unknown as VueQueryPage<any, any, any, any, any>)
    },
    _confirmed: false,
    _fetchPolicy: null,
    _resultVersion: undefined,
    rawData: cached ?? { type: 'data', value: toValue(ctx.defaultValue) },
    get data(): any {
      return readPageData(ctx, page)
    },
  })
  if (cached?.type === 'data')
    rememberPageAbsence(ctx, page as unknown as VueQueryPage<any, any, any, any, any>)
  return page as unknown as VueQueryPage<any, any, any, any, any>
}

/**
 * Whether a fetch started with `savedPageRequestId` is still the current one for this page.
 * A superseded request must not publish its result, error or completion.
 */
export function isCurrentPageRequest(
  ctx: any,
  page: VueQueryPage<any, any, any, any, any>,
  savedPageRequestId: string,
): boolean {
  return !ctx.disposed && page.requestId === savedPageRequestId && ctx.pages.value.includes(page)
}

/**
 * Return the cache key for a page index.
 */
export function getPageId(ctx: any, index: number): string {
  return `${ctx.queryId.value}#${index}`
}

/**
 * Merge base options with the options identifying a page (`pageIndex`, cursor
 * params). Live page subscriptions follow these, never refresh overrides.
 */
export function getPageIdentityOptions(ctx: any, page: Pick<VueQueryPage<any, any, any, any, any>, 'options'>) {
  return {
    ...(ctx.getOptions() ?? {}),
    ...page.options,
  }
}

/**
 * Options a page loads with: its identity options plus retained refresh overrides.
 */
export function getPageOptions(ctx: any, page: VueQueryPage<any, any, any, any, any>) {
  return {
    ...getPageIdentityOptions(ctx, page),
    ...page._refreshOptions,
  }
}

/**
 * Save a fetched page result after confirming the page is still current.
 */
export async function setPageResult(
  ctx: any,
  page: VueQueryPage<any, any, any, any, any>,
  savedPageRequestId: string,
  pageResult: any,
  fetchPolicy: FetchPolicy | undefined,
  version?: FieldTimestampValue,
  confirmed = true,
  confirmationOptions?: unknown,
): Promise<{ valid: boolean, isCurrent: () => boolean }> {
  const discarded = { valid: false, isCurrent: () => false }
  if (!isCurrentPageRequest(ctx, page, savedPageRequestId)) {
    return discarded
  }
  if (!page.main) {
    await waitForMainPagePublication(ctx)
    // Waiting for the main page can outlive this request or its consumer.
    if (!isCurrentPageRequest(ctx, page, savedPageRequestId)) {
      return discarded
    }
  }

  if (isStalePageResult(page, version, savedPageRequestId))
    return discarded

  const isCurrent = applyPageResult(ctx, page, pageResult, fetchPolicy, version, confirmed, confirmationOptions, () => isCurrentPageRequest(ctx, page, savedPageRequestId))
  return { valid: isCurrent(), isCurrent }
}

/** Apply the same representation rules to fetched and pushed results. */
export function applyPageResult(ctx: any, page: VueQueryPage<any, any, any, any, any>, result: any, fetchPolicy: FetchPolicy | undefined, version?: FieldTimestampValue, confirmed = true, confirmationOptions?: unknown, current: () => boolean = () => true): () => boolean {
  const isCurrent = beginPagePublication(page, current)
  // A later cache read of the same options cannot undo a server confirmation.
  page._confirmed ||= confirmed
  if (!isCurrent())
    return isCurrent
  page._resultVersion = version
  if (!isCurrent())
    return isCurrent
  page._fetchPolicy = fetchPolicy ?? null
  if (!isCurrent())
    return isCurrent
  setPageRepresentation(ctx, page, result, fetchPolicy === 'no-cache', confirmationOptions, isCurrent)
  if (isCurrent())
    markPagesAsComputed(ctx, isCurrent)
  return isCurrent
}

/**
 * Whether any page needs its own result instead of the aggregate cache view.
 * Resolve against detached metadata so reads cannot overwrite fetched metadata.
 */
export function hasIndependentPage(ctx: any): boolean {
  return ctx.pages.value.some((page: VueQueryPage<any, any, any, any, any> | undefined) => page && (page._fetchPolicy === 'no-cache'
    || ctx.store.$resolveFindOptions(ctx.getCollection(), getPageOptions(ctx, page), ctx.many, { ...ctx.meta.value }).resultMode === 'responseRefs'))
}

/**
 * Mark consecutive pages as computed when cache can represent the result.
 *
 * A page is a slice of the cached result only when every page before it wrote
 * its rows to the cache. A page loaded with `no-cache` wrote none, so it keeps
 * its own data and the pages after it fall back to their item keys, exactly
 * like a page loaded after a hole.
 */
export function markPagesAsComputed(ctx: any, isCurrent: () => boolean = () => true) {
  const resolvedOptions = ctx.store.$resolveFindOptions(ctx.getCollection(), ctx.getOptions() ?? {}, ctx.many, { ...ctx.meta.value })
  // First results keep their own identity or absence, even with pagination defaults.
  let cacheComputable = ctx.many && ctx.fetchPolicy !== 'no-cache' && ctx.resultMode === 'computed' && resolvedOptions.pageSize != null
  for (const page of ctx.pages.value) {
    if (!isCurrent())
      return
    // Both a missing page and an uncached one break the cached sequence the
    // following pages would be sliced out of.
    if (!page || page._fetchPolicy === 'no-cache') {
      cacheComputable = false
      continue
    }
    const pageOptions = ctx.store.$resolveFindOptions(ctx.getCollection(), getPageOptions(ctx, page), ctx.many, { ...ctx.meta.value })
    if (cacheComputable && pageOptions.resultMode === 'computed') {
      page.rawData = { type: 'computed' }
      // Retain response refs and confirmation for remounts and SSR hydration.
    }
    else if (page.rawData.type === 'computed') {
      // The page stops being a cache slice, but its rows are still cached:
      // keep the ones it currently shows by their keys.
      setPageRepresentation(ctx, page, page.data, false, undefined, isCurrent)
    }
  }
}

/**
 * Read page data from raw refs/data/computed source.
 */
function readPageData(ctx: any, page: VueQueryPage<any, any, any, any, any>) {
  const rawData = page.rawData
  switch (rawData.type) {
    case 'data':
      return rawData.value === null ? readMissingPageResult(ctx, page) : rawData.value
    case 'computed':
      return readComputedPageData(ctx, page)
    case 'refs':
      return ctx.store.$cache.readItems({ collection: ctx.getCollection(), keys: rawData.keys })
    case 'ref':
      return ctx.store.$cache.readItem({ collection: ctx.getCollection(), key: rawData.key })
  }
}

/**
 * Read data for pages represented by cache-computed slices.
 */
function readComputedPageData(ctx: any, page: VueQueryPage<any, any, any, any, any>) {
  // The plain cache read, never the aggregate: a mixed-policy query builds its
  // result from the pages, which would read this page back.
  const value = ctx.cacheRead.value
  const { pageSize } = ctx.store.$resolveFindOptions(ctx.getCollection(), getPageOptions(ctx, page), ctx.many, { ...ctx.meta.value })
  if (pageSize == null || !Array.isArray(value)) {
    return value
  }
  return value.slice(page.index * pageSize, (page.index + 1) * pageSize)
}

/**
 * Read current cache data for the query when policy allows it.
 *
 * The rows of a page fetched with `no-cache` are not in the cache, so a query
 * holding such a page aggregates its pages instead: reading the cache alone
 * would drop them from the result.
 */
export function readCachedResult(ctx: any) {
  // Missing first pages distinguish retained stale rows from later cache writes.
  const missingFirst = !ctx.many && ctx.mainPage._fetchPolicy != null && ctx.mainPage.rawData.type === 'data' && ctx.mainPage.rawData.value == null
  if (!missingFirst && ctx.fetchPolicy !== 'no-cache' && ctx.resultMode !== 'responseRefs' && !hasIndependentPage(ctx)) {
    return ctx.cacheRead.value
  }
  return ctx.result.value
}
