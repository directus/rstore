import type { QueryStateRetentionOptions } from '../storeOptions'
import type { QueryStateHolder } from './queryHolders'
import type { CacheRuntime } from './types'
import { resolveRetention } from '@rstore/core'
import { holdQueryState, isQueryStateHeld, retainQueryStateHolders } from './queryHolders'
import { deleteQueryState, getPageQueryId, pruneItemWrites } from './queryState'

/** Saved results of unmounted queries live 30 minutes, at most 500 of them. */
const defaults = { ttlMs: 30 * 60_000, maxSize: 500, maxPages: 1_000, maxKeys: 50_000 }

/** Resolve all query retention limits using the same validation as row caps. */
export function resolveQueryStateRetention(options?: QueryStateRetentionOptions | false): CacheRuntime['queryStateRetention'] {
  const base = resolveRetention(options, defaults, 'queryStateRetention')
  if (!base)
    return false
  return {
    ...base,
    maxPages: resolveRetention({ maxSize: options === false ? undefined : options?.maxPages }, { ...base, maxSize: defaults.maxPages }, 'queryStateRetention.maxPages').maxSize,
    maxKeys: resolveRetention({ maxSize: options === false ? undefined : options?.maxKeys }, { ...base, maxSize: defaults.maxKeys }, 'queryStateRetention.maxKeys').maxSize,
  }
}

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
    queueQueryStateSweep(ctx)
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
    queueQueryStateSweep(ctx)
  }
}

/** Coalesce retention updates from a batch of reads, writes and releases. */
export function queueQueryStateSweep(ctx: CacheRuntime, force = false): void {
  const retention = ctx.queryStateRetention
  if (!retention || ctx.queryStateSweepQueued)
    return
  if (!force && ctx.queryStateUsedAt.size - ctx.queryStateHeldCount + ctx.standaloneMarkers <= retention.maxSize
    && ctx.state.pageRefs.size <= retention.maxPages && ctx.queryStateKeyCount <= retention.maxKeys) {
    return
  }
  ctx.queryStateSweepQueued = true
  queueMicrotask(() => {
    ctx.queryStateSweepQueued = false
    if (!ctx.disposed)
      sweepQueryState(ctx)
  })
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
  const sizes = new Map<string, { pages: number, keys: number }>()
  const queryIds = new Set(Object.keys(ctx.state.queryMeta))
  for (const [pageId, page] of ctx.state.pageRefs) {
    const id = getPageQueryId(pageId)
    if (!id)
      continue
    queryIds.add(id)
    const size = sizes.get(id) ?? { pages: 0, keys: 0 }
    size.pages++
    size.keys += (page.type === 'refs' ? page.keys.length : Number(page.type === 'ref'))
      + Object.values(page.requiredRows ?? {}).reduce((sum, keys) => sum + keys.length, 0)
    sizes.set(id, size)
  }
  for (const placement of ctx.membership.saved()) {
    const id = getPageQueryId(placement.pageId)
    if (!id)
      continue
    queryIds.add(id)
    const size = sizes.get(id) ?? { pages: 0, keys: 0 }
    if (!ctx.state.pageRefs.has(placement.pageId))
      size.pages++
    size.keys += placement.keys
    sizes.set(id, size)
  }
  const groups = new Map<string, string[]>()
  ctx.standaloneMarkers = 0
  for (const marker of ctx.engine.markerKeys()) {
    const record = ctx.markerRetention.get(marker) ?? { usedAt: now }
    ctx.markerRetention.set(marker, record)
    if (!record.owner)
      ctx.standaloneMarkers++
    const id = record.owner ?? marker
    queryIds.add(id)
    const markers = groups.get(id) ?? []
    markers.push(marker)
    groups.set(id, markers)
  }

  const inactive: Array<{ id: string, usedAt: number, pages: number, keys: number }> = []
  for (const id of ctx.queryStateUsedAt.keys()) {
    if (!queryIds.has(id))
      ctx.queryStateUsedAt.delete(id)
  }
  ctx.queryStateHeldCount = 0
  for (const id of queryIds) {
    const markerAge = (groups.get(id) ?? []).reduce((age, marker) => Math.max(age, ctx.markerRetention.get(marker)!.usedAt), 0)
    const usedAt = Math.max(ctx.queryStateUsedAt.get(id) ?? (markerAge || now), markerAge)
    ctx.queryStateUsedAt.set(id, usedAt)
    if (isQueryStateHeld(ctx.state, id)) {
      ctx.queryStateHeldCount++
      ctx.queryStateUsedAt.set(id, now)
      continue
    }
    inactive.push({ id, usedAt, ...(sizes.get(id) ?? { pages: 0, keys: 0 }) })
  }
  inactive.sort((a, b) => a.usedAt - b.usedAt)
  let pages = inactive.reduce((sum, item) => sum + item.pages, 0)
  let keys = inactive.reduce((sum, item) => sum + item.keys, 0)
  inactive.forEach((item, index) => {
    if (now - item.usedAt < retention.ttlMs && inactive.length - index <= retention.maxSize && pages <= retention.maxPages && keys <= retention.maxKeys)
      return
    pages -= item.pages
    keys -= item.keys
    for (const marker of groups.get(item.id) ?? []) {
      if (!ctx.markerRetention.get(marker)?.owner)
        ctx.standaloneMarkers--
      ctx.engine.deleteMarker(marker)
      ctx.markerRetention.delete(marker)
    }
    ctx.membership.evict(item.id)
    deleteQueryState(ctx, item.id)
  })
  ctx.queryStateKeyCount = keys
  retainQueryStateHolders(ctx.state, queryIds)
  ctx.scopes.sweep(now)
  pruneItemWrites(ctx)
}

/**
 * Sweep saved results periodically so idle entries still expire.
 *
 * @returns Stops the timer, or `undefined` when no timer is needed.
 */
export function scheduleQueryStateSweeps(ctx: CacheRuntime, retention: CacheRuntime['queryStateRetention']): (() => void) | undefined {
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
