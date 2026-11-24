import type { QueryPageTarget } from '@rstore/shared'
import type { LocalMembershipPage } from '../cache/localMembership'
import { getCurrentScope, onScopeDispose } from 'vue'
import { capturePageConfirmation } from './confirmation'

/** Capture the same effective identity used for query cache provenance. */
export function getLocalPageTarget(ctx: any, page: any): QueryPageTarget {
  return { collection: ctx.getCollection().name, id: page.id, provenance: JSON.stringify(capturePageConfirmation(ctx, page)) }
}

/** Register exact pages as potential create targets for the query lifetime. */
export function registerQueryMembership(ctx: any): void {
  if (!ctx.many || ctx.store.$isServer || !getCurrentScope())
    return
  const unregister = ctx.cache._private.membership.register(() => {
    if (ctx.disposed || ctx.isDisabled() || ctx.resultMode !== 'responseRefs')
      return []
    const active: LocalMembershipPage[] = []
    for (const page of ctx.pages.value) {
      if (!page || page._accessDenied || page.cacheStatus === 'untracked' || ctx.resultMode !== 'responseRefs')
        continue
      const findOptions = ctx.getPageOptions(page)
      const cached = ctx.cache._private.state.pageRefs.get(page.id)
      const canInfer = page.index === 0 && findOptions.localMembership === 'auto' && page.cacheStatus === 'complete' && cached?.type === 'refs'
      active.push({
        target: getLocalPageTarget(ctx, page),
        findOptions: ctx.store.$resolveFindOptions(ctx.getCollection(), findOptions, true, { ...ctx.meta.value }),
        meta: ctx.meta.value,
        rows: canInfer
          ? ctx.store.$cache.readItems({ collection: ctx.getCollection(), keys: cached.keys })
          : [],
        canInfer,
        refresh: () => void ctx.returnObject.refresh({ pages: [page.index], dedupe: false }),
      })
    }
    return active
  })
  onScopeDispose(unregister)
}

/** Compose accepted keys with pending local insertions for an exact list. */
export function readLocalMembership(ctx: any, page: any, data: unknown): unknown {
  if (!ctx.many || !Array.isArray(data) || ctx.resultMode !== 'responseRefs' || page.cacheStatus === 'untracked' || page._accessDenied || ctx.isDisabled())
    return data
  const entries = ctx.cache._private.membership.entries(getLocalPageTarget(ctx, page))
  if (!entries.length)
    return data
  const collection = ctx.getCollection()
  const items = data.slice()
  const keyOf = (item: Record<string, unknown>) => String(collection.getKey(item))
  for (const { key, position } of entries) {
    if (items.some(item => keyOf(item) === String(key)))
      continue
    const item = ctx.store.$cache.readItem({ collection, key })
    if (!item)
      continue
    const index = position === 'start'
      ? 0
      : position === 'end' || page.cacheStatus === 'miss'
        ? items.length
        : items.findIndex(item => keyOf(item) === String(position.before))
    if (index >= 0)
      items.splice(index, 0, item)
  }
  return items
}

/** Let a confirmed post-acknowledgement fetch retire an insertion. */
export function acceptLocalMembership(ctx: any, page: any, readSequence: number): void {
  if (ctx.many && page.cacheStatus === 'complete')
    ctx.cache._private.membership.accept(getLocalPageTarget(ctx, page), readSequence)
}
