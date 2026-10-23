import type { FindOptions, QueryRefreshOptions } from '@rstore/shared'
import type { VueQueryPage } from './types'
import { loadPage } from './load'
import { addPrunedLoad, applyPrune, createPruneRun, recordKeptPage } from './prune'

/** Keep a main subscription's current overrides and index when it reloads its window. */
export function getMainPageRefreshOptions<TOptions extends FindOptions<any, any, any>>(page: VueQueryPage<any, any, any, TOptions, any>, options?: QueryRefreshOptions<TOptions>): QueryRefreshOptions<TOptions> {
  const refreshed = Object.assign({}, page._refreshOptions, options, { pages: [page.index] })
  // Removing caller redirection also preserves absence for unpaged queries,
  // whose subscribe payload must not acquire a synthetic page index.
  if (page.options.pageIndex == null)
    delete refreshed.pageIndex
  else
    refreshed.pageIndex = page.options.pageIndex
  return refreshed
}

/** Reload one retained secondary page without changing the main page's options. */
export function refreshSecondaryPage(ctx: any, page: VueQueryPage<any, any, any, any, any>, options?: QueryRefreshOptions<FindOptions<any, any, any>>) {
  if (ctx.disposed || ctx.isDisabled() || !ctx.pages.value.includes(page)) {
    return Object.assign(Promise.resolve(ctx.returnObject), ctx.returnObject)
  }
  const { prune, ...overrides } = options ?? {}
  delete overrides.pages
  // A subscription follows one window: callers cannot redirect it to another
  // page. Overrides stay apart from the identifying options (cursor params, a
  // `pageIndex` only when the page was created with one), so the followed
  // window and its subscription keep their find options.
  delete overrides.pageIndex
  page._refreshOptions = { ...page._refreshOptions, ...overrides }
  page.requestId = crypto.randomUUID()
  const pruneRun = prune ? createPruneRun() : undefined
  addPrunedLoad(pruneRun, page)
  for (const keptPage of ctx.pages.value) {
    if (keptPage && keptPage !== page)
      recordKeptPage(ctx, pruneRun, keptPage)
  }
  const promise = loadPage(ctx, page, true, pruneRun).then(() => {
    applyPrune(ctx, pruneRun)
    return ctx.returnObject
  })
  return Object.assign(promise, ctx.returnObject)
}
