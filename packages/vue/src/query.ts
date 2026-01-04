import type { Cache, Collection, CollectionDefaults, CustomHookMeta, FindOptions, HybridPromise, ResolvedCollection, StoreSchema } from '@rstore/shared'
import type { MaybeRefOrGetter, Raw, Ref } from 'vue'
import type { VueCachePrivate } from './cache'
import type { VueStore } from './store'
import { isKeyDefined } from '@rstore/core'
import { pickNonSpecialProps } from '@rstore/shared'
import { deepEqual } from 'fast-equals'
import { klona } from 'klona'
import { computed, getCurrentInstance, onServerPrefetch, ref, shallowReactive, shallowRef, toValue, watch } from 'vue'
import { useQueryTracking } from './tracking'

export interface VueQueryReturn<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema>,
  TResult,
> {
  data: Ref<TResult>
  /**
   * Whether the query is currently loading data.
   */
  loading: Ref<boolean>
  /**
   * Last encountered error during query fetching.
   */
  error: Ref<Error | null>
  /**
   * Force refreshing the query with a `fetchPolicy` of `fetch-only` or `no-cache`.
   * @param optionsExtension Optionally modify the query options.
   */
  refresh: () => HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>>
  /**
   * Sparse array of pages of the query.
   */
  pages: Ref<Array<VueQueryPage<TCollection, TCollectionDefaults, TSchema, any, TResult> | undefined>>
  /**
   * Main page of the query. Updated when the query options change or when `refresh` is called.
   */
  mainPage: VueQueryPage<TCollection, TCollectionDefaults, TSchema, any, TResult>
  /**
   * Create a new page and fetch it.
   * @param optionsExtension Options to extend the base query options for the new page. You can provide `pageIndex` to set the index of the page in the `pages` array.
   */
  fetchMore: (optionsExtension: Partial<TOptions>) => HybridPromise<{ page: VueQueryPage<TCollection, TCollectionDefaults, TSchema, any, TResult> }>
  meta: Ref<CustomHookMeta>
  /**
   * @private
   */
  _result: Ref<TResult>
}

export interface VueCreateQueryOptions<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema>,
  TResult,
> {
  store: VueStore<TSchema, TCollectionDefaults>
  fetchMethod: (options: TOptions | undefined, meta: CustomHookMeta) => Promise<TResult>
  cacheMethod: (options: TOptions | undefined, meta: CustomHookMeta) => TResult
  defaultValue: MaybeRefOrGetter<TResult>
  id: () => string
  getCollection: () => ResolvedCollection
  options?: MaybeRefOrGetter<TOptions | undefined | { enabled: boolean }>
  many: boolean
}

type VueQueryPageOptions<TOptions> = Partial<Omit<TOptions, 'pageSize'>>

export interface VueQueryPage<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema>,
  TResult,
> {
  id: string
  /**
   * Used to abort ongoing fetches when a new fetch is started for the same page.
   */
  requestId: string
  /**
   * Whether the page is the main page of the query.
   *
   * The main page of the query will be updated when the query options change or when the query `refresh` method is called.
   */
  main: boolean
  index: number
  loading: boolean
  error: Error | null
  options: VueQueryPageOptions<TOptions>
  rawData: {
    type: 'computed'
  } | {
    /**
     * Single reference to an item.
     */
    type: 'ref'
    key: string | number
  } | {
    /**
     * Multiple references to items.
     */
    type: 'refs'
    keys: Array<string | number>
  } | {
    /**
     * Direct data value.
     */
    type: 'data'
    value: TResult
  }
  data: TResult
}

/**
 * @private
 */
export function createQuery<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
  TOptions extends FindOptions<TCollection, TCollectionDefaults, TSchema>,
  TResult,
>({
  store,
  fetchMethod,
  cacheMethod,
  defaultValue,
  id,
  getCollection,
  options,
  many,
}: VueCreateQueryOptions<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>): HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>> {
  type PageOverrideOptions = VueQueryPageOptions<TOptions>

  const cache = store.$cache as Cache & VueCachePrivate
  const queryId = computed(() => JSON.stringify([id(), toValue(options)]))

  const meta = shallowRef<CustomHookMeta>(cache._private.state.queryMeta[queryId.value] || {})

  function getOptions(): TOptions | undefined {
    const result = toValue(options)
    return typeof result === 'object' && 'enabled' in result && result.enabled === false ? undefined : result as TOptions
  }

  function isDisabled() {
    const result = toValue(options)
    return typeof result === 'object' && 'enabled' in result && result.enabled === false
  }

  let { fetchPolicy } = store.$resolveFindOptions(getCollection(), getOptions() ?? {}, many, meta.value)

  const queryTrackingEnabled = !store.$isServer && fetchPolicy !== 'no-cache' && (
    store.$experimentalGarbageCollection
      ? getOptions()?.experimentalGarbageCollection !== false
      : getOptions()?.experimentalGarbageCollection === true
  )

  /**
   * Sparse array of pages
   */
  const pages = ref<Array<Raw<VueQueryPage<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>> | undefined>>([])

  function getPageId(optionsExtension: PageOverrideOptions, index: number): string {
    return `${queryId.value}#${index}`
  }

  function createPage(optionsExtension: PageOverrideOptions, main: boolean): VueQueryPage<TCollection, TCollectionDefaults, TSchema, TOptions, TResult> {
    const index = optionsExtension.pageIndex != null ? optionsExtension.pageIndex : pages.value.length
    const id = getPageId(optionsExtension, index)
    const cached = cache._private.state.pageRefs.get(id)

    const page: VueQueryPage<TCollection, TCollectionDefaults, TSchema, TOptions, TResult> = shallowReactive({
      id,
      requestId: crypto.randomUUID(),
      main,
      index,
      loading: false,
      error: null,
      options: optionsExtension,
      rawData: cached ?? {
        type: 'data',
        value: toValue(defaultValue),
      },
      get data() {
        return readPageData(page)
      },
    })
    return page
  }

  const mainPage: VueQueryPage<TCollection, TCollectionDefaults, TSchema, TOptions, TResult> = createPage({}, true)

  let mainPagePromise: Promise<unknown> | null = null

  const result = computed<TResult>(() => {
    let result: TResult = toValue(defaultValue)
    for (const page of pages.value) {
      if (!page) {
        continue
      }
      if (Array.isArray(result) && Array.isArray(page.data)) {
        result.push(...page.data)
      }
      else if (typeof result === 'object' && result && typeof page.data === 'object' && page.data) {
        result = {
          ...result,
          ...page.data,
        }
      }
      else {
        result = page.data
      }
    }
    return result
  })

  // @TODO include nested relations in no-cache results
  const cached = computed(() => {
    if (fetchPolicy !== 'no-cache') {
      const options = getOptions()
      return cacheMethod(options, meta.value) ?? null
    }
    return result.value
  }) as Ref<TResult>

  const queryTracking = queryTrackingEnabled
    ? useQueryTracking<TResult>({
        store,
        result,
        cached,
      })
    : null

  const loadingCount = ref(0)
  const loading = computed(() => loadingCount.value > 0)

  const error = ref<Error | null>(null)

  const returnObject: VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TOptions, TResult> = {
    data: queryTracking?.filteredCached ?? cached,
    loading,
    error,
    refresh,
    pages,
    mainPage,
    fetchMore,
    meta,
    _result: result,
  }

  async function loadMainPage(forceFetch = false) {
    // Clear pages

    pages.value = []
    const options = getPageOptions(mainPage)
    const index = options.pageIndex ?? 0
    pages.value[index] = mainPage

    // Reset main page

    mainPage.id = getPageId({}, index)

    mainPage.requestId = crypto.randomUUID()

    if (forceFetch) {
      mainPage.rawData = {
        type: 'data',
        value: toValue(defaultValue),
      }
    }

    // Load main page

    mainPagePromise = loadPage(mainPage, forceFetch)
    await mainPagePromise

    return returnObject
  }

  function fetchMore(optionsExtension: PageOverrideOptions): HybridPromise<{ page: VueQueryPage<TCollection, TCollectionDefaults, TSchema, TOptions, TResult> }> {
    let page: VueQueryPage<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>
    if (optionsExtension.pageIndex != null && pages.value[optionsExtension.pageIndex]?.main) {
      // Reuse main page
      page = pages.value[optionsExtension.pageIndex]!
    }
    else {
      // Create new page
      page = createPage(optionsExtension, false)
      if (optionsExtension.pageIndex != null) {
        pages.value[optionsExtension.pageIndex] = page
      }
      else {
        pages.value.push(page)
      }
    }
    const promise = loadPage(page, false) as HybridPromise<{ page: VueQueryPage<TCollection, TCollectionDefaults, TSchema, TOptions, TResult> }>
    Object.assign(promise, { page })
    return promise
  }

  function getPageOptions(page: VueQueryPage<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>): TOptions {
    const baseOptions = getOptions() ?? {} as TOptions
    return {
      ...baseOptions,
      ...page.options,
    }
  }

  async function setPageResult(page: VueQueryPage<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>, savedPageRequestId: string, pageResult: TResult): Promise<{ valid: boolean }> {
    // Ensure the page is still valid
    if (page.requestId !== savedPageRequestId || !pages.value.includes(page)) {
      return { valid: false }
    }

    // If not main page, wait for main page to load first
    if (!page.main && mainPagePromise) {
      await mainPagePromise
    }

    const options = getPageOptions(page)
    if (options.fetchPolicy === 'no-cache') {
      page.rawData = {
        type: 'data',
        value: pageResult,
      }
    }
    else if (Array.isArray(pageResult)) {
      // Store as refs
      const keys: Array<string | number> = []
      const collection = getCollection()
      for (const item of pageResult as any[]) {
        const key = collection.getKey(item)
        if (!isKeyDefined(key)) {
          console.warn(`[rstore] Item returned from query is missing primary key for collection "${collection.name}".`, item)
        }
        else {
          keys.push(key)
        }
      }
      page.rawData = {
        type: 'refs',
        keys,
      }
    }
    else if (pageResult && typeof pageResult === 'object') {
      const collection = getCollection()
      const key = collection.getKey(pageResult)
      if (!isKeyDefined(key)) {
        console.warn(`[rstore] Item returned from query is missing primary key for collection "${collection.name}".`, pageResult)
        page.rawData = {
          type: 'data',
          value: pageResult,
        }
      }
      else {
        page.rawData = {
          type: 'ref',
          key,
        }
      }
    }
    else {
      page.rawData = {
        type: 'data',
        value: pageResult,
      }
    }

    if (page.rawData.type === 'ref' || page.rawData.type === 'refs') {
      cache._private.state.pageRefs.set(page.id, page.rawData)
    }

    markPagesAsComputed()

    return { valid: true }
  }

  /**
   * Mark consecutive pages as computed when possible to compute the pages slices from the cache instead of a fixed set of refs.
   */
  function markPagesAsComputed() {
    const options = getOptions()
    if (options?.fetchPolicy === 'no-cache' || options?.pageSize == null) {
      return
    }
    for (let i = 0; i < pages.value.length; i++) {
      const page = pages.value[i]
      if (page) {
        page.rawData = { type: 'computed' }
        cache._private.state.pageRefs.delete(page.id)
      }
      else {
        break
      }
    }
  }

  function readPageData(page: VueQueryPage<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>): TResult {
    const rawData = page.rawData
    switch (rawData.type) {
      case 'data':
        return rawData.value
      case 'computed': {
        const value = cached.value
        const pageSize = getOptions()?.pageSize
        if (pageSize == null) {
          return value
        }
        if (Array.isArray(value)) {
          return value.slice(page.index * pageSize, (page.index + 1) * pageSize) as TResult
        }
        else {
          return value
        }
      }
      case 'refs':
        return store.$cache.readItems({
          collection: getCollection(),
          keys: rawData.keys,
        }) as TResult
      case 'ref':
        return store.$cache.readItem({
          collection: getCollection(),
          key: rawData.key,
        }) as TResult
    }
  }

  async function loadPage(page: VueQueryPage<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>, forceFetch: boolean) {
    if (!isDisabled()) {
      loadingCount.value++
      error.value = null
      page.loading = true
      page.error = null

      /**
       * Ensure the fetching wasn't cancelled while awaiting
       */
      const savedPageRequestId = page.requestId

      const newQueryTracking = queryTracking?.createTrackingObject()
      let shouldHandleQueryTracking = true

      try {
        const finalOptions = getPageOptions(page)

        // Main page
        if (page.main) {
          const resolvedOptions = store.$resolveFindOptions(getCollection(), finalOptions, many, meta.value)
          fetchPolicy = resolvedOptions.fetchPolicy
        }

        // If fetchPolicy is `cache-and-fetch`, fetch in parallel
        if (!forceFetch && fetchPolicy === 'cache-and-fetch') {
          shouldHandleQueryTracking = false
          const newQueryTracking2 = queryTracking?.createTrackingObject()
          fetchMethod({
            ...finalOptions,
            fetchPolicy: 'fetch-only',
          } as FindOptions<TCollection, TCollectionDefaults, TSchema> as any, {
            ...meta.value,
            $queryTracking: queryTrackingEnabled ? newQueryTracking2 : undefined,
          }).then(async (backgroundResult) => {
            const { valid } = await setPageResult(page, savedPageRequestId, backgroundResult)
            if (valid && queryTracking && newQueryTracking2) {
              queryTracking.handleQueryTracking(page.id, newQueryTracking2, undefined, finalOptions.include, page.main)
            }
          })

          // We don't use the builtin 'cache-and-fetch' of `find*' methods to have better control over query tracking handling
          finalOptions.fetchPolicy = 'cache-only'
        }

        // On refresh force fetch
        if (forceFetch) {
          finalOptions.fetchPolicy = fetchPolicy === 'no-cache' ? 'no-cache' : 'fetch-only'
        }

        // Reuse refs from cache if possible
        if (finalOptions.fetchPolicy !== 'no-cache' && finalOptions.fetchPolicy !== 'fetch-only' && cache._private.state.pageRefs.has(page.id)) {
          page.rawData = cache._private.state.pageRefs.get(page.id)!
        }
        else {
          // Actual fetching

          const fetchMeta: CustomHookMeta = {
            ...meta.value,
            $queryTracking: queryTrackingEnabled ? newQueryTracking : undefined,
          }

          const pageResult = await fetchMethod(finalOptions, fetchMeta)

          const { valid } = await setPageResult(page, savedPageRequestId, pageResult)
          if (valid) {
            if (page.main) {
              cache._private.state.queryMeta[queryId.value] = pickNonSpecialProps(fetchMeta)
            }

            meta.value = fetchMeta

            if (queryTrackingEnabled && shouldHandleQueryTracking && queryTracking && newQueryTracking) {
              queryTracking.handleQueryTracking(page.id, newQueryTracking, undefined, finalOptions.include, page.main)
            }
          }
        }
      }
      catch (e: any) {
        error.value = e
        page.error = e
        console.error(e)
      }
      finally {
        loadingCount.value--
        page.loading = false
      }
    }

    return {
      page,
    }
  }

  // Auto load on options change
  let previousOptions = klona(toValue(options))
  watch(() => toValue(options), (value) => {
    if (!deepEqual(value, previousOptions)) {
      previousOptions = klona(value)
      loadMainPage()
    }
  }, {
    deep: true,
  })

  let promise = loadMainPage() as HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>>
  Object.assign(promise, returnObject)

  function refresh(optionsExtension?: Partial<TOptions>): HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>> {
    mainPage.options = optionsExtension ?? {}
    promise = loadMainPage(true) as HybridPromise<VueQueryReturn<TCollection, TCollectionDefaults, TSchema, TOptions, TResult>>
    Object.assign(promise, returnObject)
    return promise
  }

  store.$onCacheReset(() => {
    refresh()
  })

  // SSR
  const vm = getCurrentInstance()

  if (vm && store.$isServer) {
    onServerPrefetch(() => promise)
  }

  return promise
}
