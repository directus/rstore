import type { Cache, Collection, CollectionDefaults, FindOptions, HybridPromise, StoreSchema } from '@rstore/shared'
import type { VueCachePrivate } from '../cache'
import type { VueCreateQueryOptions, VueQueryRefreshOptions, VueQueryReturn } from './types'
import { tryOnScopeDispose } from '@vueuse/core'
import { computed, getCurrentInstance, onServerPrefetch, ref, shallowRef, toValue, watch } from 'vue'
import { onWindowFocus } from '../swr'
import { useQueryTracking } from '../tracking'
import { loadPage } from './load'
import { watchQueryOptions } from './options'
import { createPage, getPageId, getPageOptions, hasUncachedPage } from './page'
import { createFetchState, getFetchStateError, isFetchStateLoading, toQueryFetchState } from './state'

/**
 * Create a reactive query object.
 */
export function createQuery<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema>,
  TResult,
>(options: VueCreateQueryOptions<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>): HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>> {
  const ctx = createQueryContext(options)
  // In-flight responses may still fill the shared cache after unmount, but
  // must never publish a page or reacquire ownership for this dead consumer.
  tryOnScopeDispose(() => {
    ctx.disposed = true
  })
  ctx.mainPage = createPage(ctx, {}, true)
  ctx.result = computed(() => mergePages(ctx))
  ctx.cacheRead = computed(() => ctx.cacheMethod(ctx.getOptions(), { ...ctx.meta.value }) ?? null)
  ctx.cached = computed(() => readCachedResult(ctx))
  ctx.queryTracking = ctx.store.$isServer
    ? null
    : useQueryTracking({ store: ctx.store, result: ctx.result, cached: ctx.cached })
  ctx.updateQueryTrackingMode()

  // `data` is read by the `loading` aggregate, so it has to exist first.
  const data = ctx.queryTracking?.filteredCached ?? ctx.cached
  const loading = computed(() => isFetchStateLoading(ctx.foreground, ctx.background, () => data.value))
  // Writable so `query.error.value = null` keeps dismissing the error like it used to.
  const error = computed({
    get: () => getFetchStateError(ctx.foreground, ctx.background),
    set: (value: Error | null) => {
      ctx.foreground.error.value = value
      ctx.background.error.value = null
    },
  })
  const returnObject = ctx.returnObject = {
    data,
    loading,
    error,
    foreground: toQueryFetchState(ctx.foreground),
    background: toQueryFetchState(ctx.background),
    refresh,
    pages: ctx.pages,
    mainPage: ctx.mainPage,
    fetchMore,
    getPage,
    meta: ctx.meta,
    _result: ctx.result,
  }

  installAutoRefresh(ctx, refresh)
  const queryOptions = watchQueryOptions(() => toValue(ctx.options), () => {
    ctx.updateQueryTrackingMode()
    loadMainPage()
  })
  let promise = loadMainPage() as unknown as HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>>
  Object.assign(promise, returnObject)

  function loadMainPage(forceFetch = false, pageIndexes?: number[], resetPages = !forceFetch) {
    // A normal forced refresh keeps and reloads every page. A reset discards
    // them because the options now identify a different query; leaving a page
    // reset but unloaded would falsely claim it had never been fetched.
    const previousPages = ctx.pages.value.filter(Boolean)
    const otherPages = resetPages
      ? []
      : ctx.pages.value.filter(page => page && page !== ctx.mainPage)
    if (resetPages) {
      for (const page of previousPages) {
        if (!ctx.pendingTrackingPageIds.includes(page.id)) {
          ctx.pendingTrackingPageIds.push(page.id)
        }
      }
    }
    // A page the caller left out is re-registered untouched: not loading it is precisely the reason
    // not to reset it.
    const shouldLoad = (index: number) => pageIndexes == null || pageIndexes.includes(index)
    ctx.pages.value = []
    const pageOptions = getPageOptions(ctx, ctx.mainPage)
    const index = pageOptions.pageIndex ?? 0
    const previousMainId = ctx.mainPage.id
    const nextMainId = getPageId(ctx, index)
    if (forceFetch && !resetPages && previousMainId !== nextMainId) {
      ctx.queryTracking?.releasePage(previousMainId, { collect: true })
    }
    ctx.mainPage.index = index
    ctx.pages.value[index] = ctx.mainPage
    ctx.mainPage.id = nextMainId
    const promises: Array<Promise<unknown>> = []
    if (shouldLoad(index)) {
      ctx.mainPage.requestId = crypto.randomUUID()
      // Kept as the main page promise even when it is not reloaded: `setPageResult` awaits it so the
      // main page result always lands first, and the previous one has already settled.
      ctx.mainPagePromise = loadPage(ctx, ctx.mainPage, forceFetch)
      promises.push(ctx.mainPagePromise)
    }
    // Started after `mainPagePromise` is assigned, for the same reason.
    for (const page of otherPages) {
      // The main page may have moved onto this slot, and it owns it.
      if (ctx.pages.value[page.index]) {
        continue
      }
      ctx.pages.value[page.index] = page
      if (!shouldLoad(page.index)) {
        continue
      }
      // Supersedes any fetch still in flight for the page, like the main page above.
      page.requestId = crypto.randomUUID()
      promises.push(loadPage(ctx, page, forceFetch))
    }
    return Promise.all(promises).then(() => returnObject)
  }

  function getPage(optionsExtension: Partial<TOptions>) {
    if (optionsExtension.pageIndex != null) {
      const existingPage = ctx.pages.value[optionsExtension.pageIndex]
      if (existingPage)
        return existingPage
      if (optionsExtension.pageIndex === ctx.mainPage.index) {
        ctx.pages.value[optionsExtension.pageIndex] = ctx.mainPage
        return ctx.mainPage
      }
      const page = createPage(ctx, optionsExtension, false)
      ctx.pages.value[optionsExtension.pageIndex] = page
      return page
    }
    const page = createPage(ctx, optionsExtension, false)
    ctx.pages.value.push(page)
    return page
  }

  /** Load a page while superseding any earlier load of the same page. */
  function fetchMore(optionsExtension: Partial<TOptions>) {
    const page = getPage(optionsExtension)
    // Indexed pages can be loaded again while an earlier fetch is still pending.
    // Give this load the same supersession protection as an explicit refresh.
    page.requestId = crypto.randomUUID()
    const nextPromise = loadPage(ctx, page, false) as HybridPromise<{ page: any }>
    Object.assign(nextPromise, { page })
    return nextPromise
  }

  function refresh(options?: VueQueryRefreshOptions<TOptions>) {
    // `pages` selects what to reload; the rest is the main page's find options.
    const { pages, ...optionsExtension } = options ?? {}
    ctx.mainPage.options = optionsExtension
    const mainPageIndex = getPageOptions(ctx, ctx.mainPage).pageIndex ?? 0
    const includesMainPage = pages == null || pages.includes(mainPageIndex)
    const changedOptions = includesMainPage && queryOptions.consume()
    if (changedOptions) {
      ctx.updateQueryTrackingMode()
    }
    promise = loadMainPage(true, pages, changedOptions) as unknown as HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>>
    Object.assign(promise, returnObject)
    return promise
  }

  ctx.store.$onCacheReset(() => refresh())
  const vm = getCurrentInstance()
  if (vm && ctx.store.$isServer) {
    onServerPrefetch(() => promise)
  }
  return promise
}

/**
 * Build the mutable context shared by query helper modules.
 */
function createQueryContext(options: VueCreateQueryOptions<any, any, any, any, any>) {
  const cache = options.store.$cache as Cache & VueCachePrivate
  const queryId = computed(() => JSON.stringify([options.id(), toValue(options.options)]))
  const meta = shallowRef(cache._private.state.queryMeta[queryId.value] || {})
  const getOptions = () => {
    const result = toValue(options.options)
    return typeof result === 'object' && 'enabled' in result && result.enabled === false ? undefined : result
  }
  const isDisabled = () => {
    const result = toValue(options.options)
    return typeof result === 'object' && 'enabled' in result && result.enabled === false
  }
  const getAutoRefresh = () => options.store.$resolveFindOptions(options.getCollection(), getOptions() ?? {}, options.many, { ...meta.value }).fetchOptions.autoRefresh
  const initialResolvedOptions = options.store.$resolveFindOptions(options.getCollection(), getOptions() ?? {}, options.many, meta.value)
  const getQueryTrackingEnabled = () => {
    if (options.store.$isServer || isDisabled()) {
      return false
    }
    const resolved = options.store.$resolveFindOptions(options.getCollection(), getOptions() ?? {}, options.many, meta.value)
    if (resolved.fetchPolicy === 'no-cache') {
      return false
    }
    return options.store.$experimentalGarbageCollection
      ? getOptions()?.experimentalGarbageCollection !== false
      : getOptions()?.experimentalGarbageCollection === true
  }

  const ctx = {
    ...options,
    /** Whether the owning effect scope has stopped. */
    disposed: false,
    cache,
    queryId,
    meta,
    getOptions,
    isDisabled,
    getAutoRefresh,
    fetchPolicy: initialResolvedOptions.fetchPolicy,
    resultMode: initialResolvedOptions.resultMode,
    queryTrackingEnabled: getQueryTrackingEnabled(),
    pages: ref<any[]>([]),
    foreground: createFetchState(),
    background: createFetchState(),
    mainPage: null as any,
    mainPagePromise: null as Promise<unknown> | null,
    result: null as any,
    /** Plain cache read of the query options, the source of computed pages. */
    cacheRead: null as any,
    cached: null as any,
    queryTracking: null as any,
    updateQueryTrackingMode: () => {},
    pendingTrackingPageIds: [] as string[],
    returnObject: null as any,
    getPageOptions: null as any,
  }
  ctx.getPageOptions = (page: any) => getPageOptions(ctx, page)
  ctx.updateQueryTrackingMode = () => {
    ctx.queryTrackingEnabled = getQueryTrackingEnabled()
    ctx.queryTracking?.setEnabled(ctx.queryTrackingEnabled)
  }
  return ctx
}

/**
 * Merge page data into a single query result.
 */
function mergePages(ctx: any) {
  let result = toValue(ctx.defaultValue)
  for (const page of ctx.pages.value) {
    if (!page)
      continue
    if (Array.isArray(result) && Array.isArray(page.data)) {
      result.push(...page.data)
    }
    else if (typeof result === 'object' && result && typeof page.data === 'object' && page.data) {
      result = { ...result, ...page.data }
    }
    else {
      result = page.data
    }
  }
  return result
}

/**
 * Read current cache data for the query when policy allows it.
 *
 * The rows of a page fetched with `no-cache` are not in the cache, so a query
 * holding such a page aggregates its pages instead: reading the cache alone
 * would drop them from the result.
 */
function readCachedResult(ctx: any) {
  if (ctx.fetchPolicy !== 'no-cache' && ctx.resultMode !== 'responseRefs' && !hasUncachedPage(ctx)) {
    return ctx.cacheRead.value
  }
  return ctx.result.value
}

/**
 * Install window-focus auto refresh.
 */
function installAutoRefresh(ctx: any, refresh: () => unknown) {
  let stopAutoRefresh: (() => void) | undefined
  watch(ctx.getAutoRefresh, (autoRefresh) => {
    stopAutoRefresh?.()
    stopAutoRefresh = autoRefresh === 'windowFocus' ? onWindowFocus(() => refresh()) : undefined
  }, { immediate: true })
  tryOnScopeDispose(() => stopAutoRefresh?.())
}
