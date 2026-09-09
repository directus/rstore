import type { FetchPolicy, FindOptions } from '@rstore/shared'
import type { VueQueryPage, VueQueryPageOptions } from './types'
import { isKeyDefined } from '@rstore/core'
import { shallowReactive, toValue } from 'vue'
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
  const cached = ctx.cache._private.state.pageRefs.get(id)
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
    _fetchPolicy: null,
    rawData: cached ?? { type: 'data', value: toValue(ctx.defaultValue) },
    get data(): any {
      return readPageData(ctx, page)
    },
  })
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
 * Merge base options with page-specific options.
 */
export function getPageOptions(ctx: any, page: VueQueryPage<any, any, any, any, any>) {
  return {
    ...(ctx.getOptions() ?? {}),
    ...page.options,
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
): Promise<{ valid: boolean }> {
  if (!isCurrentPageRequest(ctx, page, savedPageRequestId)) {
    return { valid: false }
  }
  if (!page.main && ctx.mainPagePromise) {
    await ctx.mainPagePromise
    // Waiting for the main page can outlive this request or its consumer.
    if (!isCurrentPageRequest(ctx, page, savedPageRequestId)) {
      return { valid: false }
    }
  }

  // Use the policy resolved for this load, including defaults and hook changes.
  // A no-cache response cannot be represented by references into the cache.
  page._fetchPolicy = fetchPolicy ?? null
  setPageRepresentation(ctx, page, pageResult, fetchPolicy === 'no-cache')
  markPagesAsComputed(ctx)
  return { valid: true }
}

/**
 * Whether a page of the query holds rows that were never written to the cache.
 */
export function hasUncachedPage(ctx: any): boolean {
  return ctx.pages.value.some((page: VueQueryPage<any, any, any, any, any> | undefined) => page?._fetchPolicy === 'no-cache')
}

/**
 * Store a page value as cache references, or as plain data when the cache does
 * not hold it.
 *
 * @param ctx Query context owning the page.
 * @param page Page to represent.
 * @param value Value the page has to expose.
 * @param uncached Whether the value was obtained without writing to the cache.
 */
function setPageRepresentation(ctx: any, page: VueQueryPage<any, any, any, any, any>, value: any, uncached: boolean) {
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

  if (page.rawData.type === 'ref' || page.rawData.type === 'refs') {
    ctx.cache._private.state.pageRefs.set(page.id, page.rawData)
  }
  else {
    ctx.cache._private.state.pageRefs.delete(page.id)
  }
}

/**
 * Mark consecutive pages as computed when cache can represent the result.
 *
 * A page is a slice of the cached result only when every page before it wrote
 * its rows to the cache. A page loaded with `no-cache` wrote none, so it keeps
 * its own data and the pages after it fall back to their item keys, exactly
 * like a page loaded after a hole.
 */
function markPagesAsComputed(ctx: any) {
  const resolvedOptions = ctx.store.$resolveFindOptions(ctx.getCollection(), ctx.getOptions() ?? {}, ctx.many, ctx.meta.value)
  let cacheComputable = ctx.fetchPolicy !== 'no-cache' && ctx.resultMode === 'computed' && resolvedOptions.pageSize != null
  for (const page of ctx.pages.value) {
    // Both a missing page and an uncached one break the cached sequence the
    // following pages would be sliced out of.
    if (!page || page._fetchPolicy === 'no-cache') {
      cacheComputable = false
      continue
    }
    if (cacheComputable) {
      page.rawData = { type: 'computed' }
      ctx.cache._private.state.pageRefs.delete(page.id)
    }
    else if (page.rawData.type === 'computed') {
      // The page stops being a cache slice, but its rows are still cached:
      // keep the ones it currently shows by their keys.
      setPageRepresentation(ctx, page, page.data, false)
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
      return rawData.value
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
  const { pageSize } = ctx.store.$resolveFindOptions(ctx.getCollection(), getPageOptions(ctx, page), ctx.many, ctx.meta.value)
  if (pageSize == null || !Array.isArray(value)) {
    return value
  }
  return value.slice(page.index * pageSize, (page.index + 1) * pageSize)
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
