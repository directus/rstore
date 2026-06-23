import type { FindOptions } from '@rstore/shared'
import type { VueQueryPage, VueQueryPageOptions } from './types'
import { isKeyDefined } from '@rstore/core'
import { shallowReactive, toValue } from 'vue'

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
  const page = shallowReactive({
    id,
    requestId: crypto.randomUUID(),
    main,
    index,
    loading: false,
    completed: false,
    error: null,
    options: optionsExtension,
    rawData: cached ?? { type: 'data', value: toValue(ctx.defaultValue) },
    get data() {
      return readPageData(ctx, page)
    },
  })
  return page as VueQueryPage<any, any, any, any, any>
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
): Promise<{ valid: boolean }> {
  if (page.requestId !== savedPageRequestId || !ctx.pages.value.includes(page)) {
    return { valid: false }
  }
  if (!page.main && ctx.mainPagePromise) {
    await ctx.mainPagePromise
  }

  const options = getPageOptions(ctx, page)
  if (options.fetchPolicy === 'no-cache') {
    page.rawData = { type: 'data', value: pageResult }
  }
  else if (Array.isArray(pageResult)) {
    page.rawData = { type: 'refs', keys: collectResultKeys(ctx, pageResult) }
  }
  else if (pageResult && typeof pageResult === 'object') {
    setObjectPageResult(ctx, page, pageResult)
  }
  else {
    page.rawData = { type: 'data', value: pageResult }
  }

  if (page.rawData.type === 'ref' || page.rawData.type === 'refs') {
    ctx.cache._private.state.pageRefs.set(page.id, page.rawData)
  }
  markPagesAsComputed(ctx)
  return { valid: true }
}

/**
 * Mark consecutive pages as computed when cache can represent the result.
 */
function markPagesAsComputed(ctx: any) {
  const resolvedOptions = ctx.store.$resolveFindOptions(ctx.getCollection(), ctx.getOptions() ?? {}, ctx.many, ctx.meta.value)
  if (ctx.fetchPolicy === 'no-cache' || ctx.resultMode !== 'computed' || resolvedOptions.pageSize == null) {
    return
  }
  for (const page of ctx.pages.value) {
    if (!page)
      break
    page.rawData = { type: 'computed' }
    ctx.cache._private.state.pageRefs.delete(page.id)
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
  const value = ctx.cached.value
  const pageSize = ctx.getOptions()?.pageSize
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
