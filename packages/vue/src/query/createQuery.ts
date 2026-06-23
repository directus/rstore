import type { Cache, Collection, CollectionDefaults, FindOptions, HybridPromise, StoreSchema } from '@rstore/shared'
import type { VueCachePrivate } from '../cache'
import type { VueCreateQueryOptions, VueQueryReturn } from './types'
import { tryOnScopeDispose } from '@vueuse/core'
import { deepEqual } from 'fast-equals'
import { klona } from 'klona'
import { computed, getCurrentInstance, onServerPrefetch, ref, shallowRef, toValue, watch } from 'vue'
import { onWindowFocus } from '../swr'
import { useQueryTracking } from '../tracking'
import { loadPage } from './load'
import { createPage, getPageId, getPageOptions } from './page'

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
  ctx.mainPage = createPage(ctx, {}, true)
  ctx.result = computed(() => mergePages(ctx))
  ctx.cached = computed(() => readCachedResult(ctx))
  ctx.queryTracking = ctx.queryTrackingEnabled
    ? useQueryTracking({ store: ctx.store, result: ctx.result, cached: ctx.cached })
    : null

  const loading = computed(() => ctx.loadingCount.value > 0)
  const returnObject = ctx.returnObject = {
    data: ctx.queryTracking?.filteredCached ?? ctx.cached,
    loading,
    error: ctx.error,
    refresh,
    pages: ctx.pages,
    mainPage: ctx.mainPage,
    fetchMore,
    getPage,
    meta: ctx.meta,
    _result: ctx.result,
  }

  installAutoRefresh(ctx, refresh)
  watchOptions(ctx, () => loadMainPage())
  let promise = loadMainPage() as unknown as HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>>
  Object.assign(promise, returnObject)

  function loadMainPage(forceFetch = false) {
    ctx.pages.value = []
    const pageOptions = getPageOptions(ctx, ctx.mainPage)
    const index = pageOptions.pageIndex ?? 0
    ctx.mainPage.index = index
    ctx.pages.value[index] = ctx.mainPage
    ctx.mainPage.id = getPageId(ctx, index)
    ctx.mainPage.requestId = crypto.randomUUID()
    ctx.mainPagePromise = loadPage(ctx, ctx.mainPage, forceFetch)
    return ctx.mainPagePromise.then(() => returnObject)
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

  function fetchMore(optionsExtension: Partial<TOptions>) {
    const page = getPage(optionsExtension)
    const nextPromise = loadPage(ctx, page, false) as HybridPromise<{ page: any }>
    Object.assign(nextPromise, { page })
    return nextPromise
  }

  function refresh(optionsExtension?: Partial<TOptions>) {
    ctx.mainPage.options = optionsExtension ?? {}
    promise = loadMainPage(true) as unknown as HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>>
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
  const queryTrackingEnabled = !options.store.$isServer && initialResolvedOptions.fetchPolicy !== 'no-cache' && (
    options.store.$experimentalGarbageCollection
      ? getOptions()?.experimentalGarbageCollection !== false
      : getOptions()?.experimentalGarbageCollection === true
  )

  const ctx = {
    ...options,
    cache,
    queryId,
    meta,
    getOptions,
    isDisabled,
    getAutoRefresh,
    fetchPolicy: initialResolvedOptions.fetchPolicy,
    resultMode: initialResolvedOptions.resultMode,
    queryTrackingEnabled,
    pages: ref<any[]>([]),
    loadingCount: ref(0),
    error: ref<Error | null>(null),
    mainPage: null as any,
    mainPagePromise: null as Promise<unknown> | null,
    result: null as any,
    cached: null as any,
    queryTracking: null as any,
    returnObject: null as any,
    getPageOptions: null as any,
  }
  ctx.getPageOptions = (page: any) => getPageOptions(ctx, page)
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
 */
function readCachedResult(ctx: any) {
  if (ctx.fetchPolicy !== 'no-cache' && ctx.resultMode !== 'responseRefs') {
    return ctx.cacheMethod(ctx.getOptions(), { ...ctx.meta.value }) ?? null
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

/**
 * Reload the main page when options change meaningfully.
 */
function watchOptions(ctx: any, loadMainPage: () => unknown) {
  let previousOptions = klona(toValue(ctx.options))
  watch(() => toValue(ctx.options), (value) => {
    if (!deepEqual(value, previousOptions)) {
      previousOptions = klona(value)
      loadMainPage()
    }
  }, { deep: true })
}
