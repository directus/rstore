import type { Collection, CollectionDefaults, FindOptionsInclude, StoreSchema } from '@rstore/shared'
import type { MaybeRefOrGetter } from 'vue'
import type { VueStore } from './store'
import { tryOnScopeDispose } from '@vueuse/core'
import { createQueryTrackingController } from './trackingOwnership'

/** Options accepted by the public query ownership helper. */
export interface UseQueryTrackingOptions<TResult> {
  /** Store containing the query cache. */
  store: VueStore
  /** Cache-backed result exposed to consumers. */
  cached: MaybeRefOrGetter<TResult>
  /** Latest network result, used when cache data is unavailable. */
  result?: MaybeRefOrGetter<TResult>
  /** Included relations selected by the current query options. */
  include?: () => FindOptionsInclude<Collection, CollectionDefaults, StoreSchema> | undefined
}

/**
 * Create page-aware ownership for one query.
 *
 * Disposal releases every page and schedules collection after Vue updates the
 * rendered result, so another live query can retain shared rows first.
 */
export function useQueryTracking<TResult>(options: UseQueryTrackingOptions<TResult>) {
  const controller = createQueryTrackingController(options)
  tryOnScopeDispose(() => controller.dispose())
  return controller
}
