import type { QueryTrackingOwnershipOptions } from './trackingOwnership'
import { tryOnScopeDispose } from '@vueuse/core'
import { createQueryTrackingController } from './trackingOwnership'

/** Options accepted by the public query ownership helper. */
export interface UseQueryTrackingOptions<TResult> extends QueryTrackingOwnershipOptions<TResult> {}

/**
 * Create page-aware ownership for one query.
 *
 * Disposal releases every page and schedules collection after Vue updates the
 * rendered result, so another live query can retain shared rows first.
 */
export function useQueryTracking<TResult>(options: UseQueryTrackingOptions<TResult>) {
  const controller = createQueryTrackingController(options)
  tryOnScopeDispose(controller.dispose)
  return controller
}
