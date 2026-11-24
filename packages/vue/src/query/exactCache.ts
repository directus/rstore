import type { CachedPageRefs } from '../cache/types'
import type { VueQueryPage } from './types'
import { getMatchingPageRefs } from './confirmation'

/** Check all referenced committed rows without counting validation as a cache read. */
export function readSavedPage(ctx: any, page: Pick<VueQueryPage<any, any, any, any, any>, 'id' | 'options'>, exact: boolean): CachedPageRefs | undefined {
  const saved = getMatchingPageRefs(ctx, page)
  if (!saved || !exact)
    return saved
  if (!saved.confirmed)
    return
  if (saved.type === 'data')
    return saved.invalidated ? undefined : saved
  if (hasExactRows(ctx, saved, saved.requiredRows))
    return saved
}

/** Check refs against committed state, even if optimistic layers currently hide them. */
export function hasExactRows(ctx: any, refs: { type: 'ref', key: string | number } | { type: 'refs', keys: Array<string | number> }, requiredRows?: Record<string, Array<string | number>>): boolean {
  const rows = ctx.cache._private.state.collections[ctx.getCollection().name]?.value
  const keys = refs.type === 'ref' ? [refs.key] : refs.keys
  return keys.every(key => rows?.[key] !== undefined)
    && Object.entries(requiredRows ?? {}).every(([collection, keys]) => {
      const related = ctx.cache._private.state.collections[collection]?.value
      return keys.every(key => related?.[key] !== undefined)
    })
}

/** Drop the current exact page after an access denial, keeping unrelated pages. */
export function invalidateDeniedPage(ctx: any, page: VueQueryPage<any, any, any, any, any>, error: unknown): void {
  const failure = error as { status?: number, statusCode?: number, response?: { status?: number } } | null
  const status = failure?.statusCode ?? failure?.status ?? failure?.response?.status
  if (page.cacheStatus === 'untracked' || (status !== 401 && status !== 403))
    return
  const options = ctx.store.$resolveFindOptions(ctx.getCollection(), ctx.getPageOptions(page), ctx.many, {})
  if (options.cacheScope)
    ctx.cache._private.scopes.invalidate(ctx.getCollection().name, options.cacheScope)
  ctx.cache._private.state.pageRefs.delete(page.id)
  page.rawData = { type: 'data', value: ctx.many ? [] : null }
  page._accessDenied = true
  page._confirmed = false
  page._hasExactResult = false
}
