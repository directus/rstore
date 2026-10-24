import type { ResolvedRetention } from '@rstore/core'
import type { QueryStateHolder } from './queryHolders'
import type { CacheRuntime } from './types'
import { selectEvictions } from '@rstore/core'
import { holdQueryState, isQueryStateHeld, retainQueryStateHolders } from './queryHolders'
import { deleteQueryState, getPageQueryId, pruneItemWrites } from './queryState'

/** Saved results of unmounted queries live 30 minutes, at most 500 of them. */
export const defaultQueryStateRetention: ResolvedRetention = { ttlMs: 30 * 60_000, maxSize: 500 }

/** How often saved results are checked for expiration. */
const sweepIntervalMs = 60_000

/** Query id each consumer last saved results under. */
const heldQueryIds = new WeakMap<QueryStateHolder, string>()

/**
 * Record that a live query saved results under `queryId`.
 *
 * Saved results are a response cache for remounts, keyed by serialized
 * options, so distinct options (search-as-you-type) keep adding entries. Going
 * over the size limit sweeps once at the end of the current task.
 */
export function holdRetainedQueryState(ctx: CacheRuntime, queryId: string, holder: QueryStateHolder): void {
  holdQueryState(ctx.state, queryId, holder)
  heldQueryIds.set(holder, queryId)
  // Without retention nothing ages: keep no per-id timestamps either.
  if (ctx.queryStateRetention) {
    ctx.queryStateUsedAt.set(queryId, Date.now())
    queueOverflowSweep(ctx)
  }
}

/**
 * Start the retention age of the results a consumer last saved, now that it
 * stopped using them (unmounted): they count toward the size limit.
 *
 * The id is the one recorded when saving, not recomputed: the consumer's
 * options may no longer evaluate once its source state is gone.
 */
export function releaseRetainedQueryState(ctx: CacheRuntime, holder: QueryStateHolder): void {
  const queryId = heldQueryIds.get(holder)
  if (queryId != null && ctx.queryStateUsedAt.has(queryId)) {
    ctx.queryStateUsedAt.set(queryId, Date.now())
    ctx.queryStateHeldCount = Math.max(0, ctx.queryStateHeldCount - 1)
    queueOverflowSweep(ctx)
  }
}

/**
 * Sweep once at the end of the current task when unmounted entries may exceed
 * the size limit.
 *
 * Mounted entries never count, so the check subtracts how many the last sweep
 * found mounted (minus unmounts since). Otherwise more mounted queries than
 * `maxSize` would run a full sweep, evicting nothing, on every save.
 */
function queueOverflowSweep(ctx: CacheRuntime): void {
  const retention = ctx.queryStateRetention
  const unheld = ctx.queryStateUsedAt.size - ctx.queryStateHeldCount
  if (retention && unheld > retention.maxSize && !ctx.queryStateSweepQueued) {
    ctx.queryStateSweepQueued = true
    queueMicrotask(() => {
      ctx.queryStateSweepQueued = false
      sweepQueryState(ctx)
    })
  }
}

/**
 * Evict saved results of unmounted queries past their TTL or beyond the size
 * limit, least recently used first. Results of mounted queries are never
 * evicted nor counted: their age restarts at every sweep, so an unmounted
 * query's age counts from about when it stopped being used.
 */
export function sweepQueryState(ctx: CacheRuntime, now = Date.now()): void {
  const retention = ctx.queryStateRetention
  if (!retention) {
    return
  }
  const queryIds = new Set(Object.keys(ctx.state.queryMeta))
  for (const pageId of ctx.state.pageRefs.keys()) {
    const queryId = getPageQueryId(pageId)
    if (queryId) {
      queryIds.add(queryId)
    }
  }
  const usedAt = ctx.queryStateUsedAt
  for (const queryId of usedAt.keys()) {
    if (!queryIds.has(queryId)) {
      usedAt.delete(queryId)
    }
  }
  const evictable: Array<[string, number]> = []
  let held = 0
  for (const queryId of queryIds) {
    if (isQueryStateHeld(ctx.state, queryId)) {
      usedAt.set(queryId, now)
      held++
      continue
    }
    // Hydrated or restored entries were never touched here: start their age now.
    if (!usedAt.has(queryId)) {
      usedAt.set(queryId, now)
    }
    evictable.push([queryId, usedAt.get(queryId)!])
  }
  ctx.queryStateHeldCount = held
  for (const queryId of selectEvictions(evictable, retention, now)) {
    deleteQueryState(ctx, queryId)
  }
  // Checking each id above already pruned the dead consumers of kept ids.
  retainQueryStateHolders(ctx.state, queryIds)
  pruneItemWrites(ctx)
}

/**
 * Sweep saved results periodically so idle entries still expire.
 *
 * @returns Stops the timer, or `undefined` when no timer is needed.
 */
export function scheduleQueryStateSweeps(ctx: CacheRuntime, retention: ResolvedRetention | false): (() => void) | undefined {
  if (!retention || retention.ttlMs === Infinity || typeof setInterval === 'undefined') {
    return undefined
  }
  const handle = setInterval(() => sweepQueryState(ctx), sweepIntervalMs)
  // Don't keep a Node process alive solely for this sweep.
  if (typeof (handle as { unref?: () => unknown }).unref === 'function') {
    (handle as { unref: () => void }).unref()
  }
  return () => clearInterval(handle)
}
