import type { CustomHookMeta, FindOptions } from '@rstore/shared'
import type { EffectScope, ShallowRef } from 'vue'
import type { CollectionApiRuntime } from './query'
import type { LiveQueryOptions } from './types'
import { tryOnScopeDispose } from '@vueuse/core'
import { klona } from 'klona'
import { effectScope, reactive, shallowRef, toValue, watch } from 'vue'
import { equalFindOptions } from '../query/options'
import { getPageIdentityOptions } from '../query/page'
import { subscribeToApiQuery } from './subscription'
import { createSubscriptionQueue } from './subscriptionQueue'

/** One selected page and its detached subscription options. */
interface FollowedPage {
  /** Page identity, also guarding against replacement at the same index. */
  page: any
  /** Position in the query's pages array. */
  index: number
  /** Base query identity, including options overridden by this page. */
  baseOptions: FindOptions<any, any, any>
  /** Base options merged with the page's identifying options, never refresh overrides. */
  findOptions: FindOptions<any, any, any>
}

/** Active subscription scope and the descriptor its callbacks belong to. */
interface PageSubscription {
  /** Independent scope so reconciliation can release this page alone. */
  scope: EffectScope
  /** Last selected window. */
  followed: FollowedPage
  /** Reactive input for the reusable single-subscription unit. */
  options: ShallowRef<FindOptions<any, any, any>>
}

/** Keep exactly the selected query pages live through one serialized queue. */
export function subscribeToLivePages(
  runtime: CollectionApiRuntime,
  query: any,
  getOptions: () => FindOptions<any, any, any>,
  many: boolean,
  options: LiveQueryOptions = {},
): void {
  if (runtime.store.$isServer)
    return
  // Result publication replaces query metadata. Keep one reactive object for
  // connector payloads, including hooks that finish after the initial fetch.
  // Copy first: the initial value can be the cache's own entry for these
  // options, which later publications for other options must not mutate.
  const meta = reactive({ ...query.meta.value } as CustomHookMeta)
  watch(() => query.meta.value, (value) => {
    if (value !== meta) {
      Object.assign(meta, value)
      query.meta.value = meta
    }
  }, { immediate: true, flush: 'sync' })
  const subscriptions = new Map<number, PageSubscription>()
  const createQueueOwner = createSubscriptionQueue()
  let disposed = false

  /** Resolve selection from current pages, without observing their data/loading. */
  function selectedPages(): FollowedPage[] {
    const base = getOptions()
    if (base.enabled === false)
      return []
    const policy = options.pages ?? 'main'
    const indexes = policy === 'main'
      ? [query.mainPage.index]
      : policy === 'all'
        ? query.pages.value.flatMap((page: any, index: number) => page ? [index] : [])
        : toValue(policy)
    return [...new Set<number>(indexes)].flatMap((index) => {
      const page = query.pages.value[index]
      return page
        ? [{ page, index, baseOptions: klona(base), findOptions: klona(getPageIdentityOptions({ getOptions: () => base }, page)) }]
        : []
    })
  }

  /** Test current ownership synchronously, before queued teardown can run. */
  function isActive(followed: FollowedPage): boolean {
    return !disposed && selectedPages().some(current => current.index === followed.index
      && current.page === followed.page && equalFindOptions(current.baseOptions, followed.baseOptions) && equalFindOptions(current.findOptions, followed.findOptions))
  }

  // Batch loadMainPage's temporary empty/restored array writes: refreshing a
  // retained page must not close and reopen its subscription.
  watch(selectedPages, (pages) => {
    for (const [index, subscription] of subscriptions) {
      const next = pages.find(page => page.index === index)
      if (!next || next.page !== subscription.followed.page) {
        subscription.scope.stop()
        subscriptions.delete(index)
      }
      else {
        const changed = !equalFindOptions(next.findOptions, subscription.followed.findOptions)
        // Base options can change beneath an unchanged page override. Refresh
        // ownership even when the transport still follows the same window.
        subscription.followed = next
        if (changed)
          subscription.options.value = next.findOptions
      }
    }
    for (const followed of pages) {
      if (subscriptions.has(followed.index))
        continue
      // Watcher callbacks run outside the original scope. Own each single
      // subscription explicitly and stop it on selection changes or disposal.
      const scope = effectScope(true)
      const subscription: PageSubscription = { scope, followed, options: shallowRef(followed.findOptions) }
      const queueOwner = createQueueOwner(followed.index)
      scope.run(() => subscribeToApiQuery(runtime, subscription.options, {
        meta: query.meta,
        enqueue: queueOwner.enqueue,
        onTeardownFailure: queueOwner.retainTeardown,
        pageIndex: () => {
          const resolved = runtime.store.$resolveFindOptions(runtime.getCollection(), subscription.followed.findOptions, many, { ...query.meta.value })
          return many && (resolved.pageSize != null || resolved.pageIndex != null || !followed.page.main) ? followed.index : undefined
        },
        isActive: () => isActive(subscription.followed),
        refresh: refreshOptions => query._refreshPage(followed.page, refreshOptions),
        setResult: (result, resultOptions) => query._setPageResult(followed.page, result, resultOptions?.meta, resultOptions?.version),
      }))
      subscriptions.set(followed.index, subscription)
    }
  }, { immediate: true })

  tryOnScopeDispose(() => {
    disposed = true
    for (const subscription of subscriptions.values())
      subscription.scope.stop()
    subscriptions.clear()
  })
}
