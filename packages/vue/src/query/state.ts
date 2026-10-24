import type { FetchStateController, VueQueryFetchState, VueQueryPage, VueQueryPageFetchState } from './types'
import { computed, shallowRef } from 'vue'

/**
 * Create the bookkeeping for one fetch lane: the blocking foreground fetch, or the silent
 * background revalidation of `cache-and-fetch`.
 */
export function createFetchState(): FetchStateController {
  const count = shallowRef(0)
  const error = shallowRef<Error | null>(null)
  const completed = shallowRef(false)
  const lastUpdated = shallowRef<number | null>(null)
  // Starts resolved so awaiting a lane that never ran (e.g. `background` on a `cache-first`
  // query) returns immediately instead of hanging forever.
  const promise = shallowRef<Promise<void>>(Promise.resolve())
  let resolveCurrent: (() => void) | null = null
  // A current result can settle before the superseded request sharing its lane.
  let hasCurrentSettlement = false

  /** Acquire one in-flight lane slot. */
  function start() {
    hasCurrentSettlement = false
    if (count.value === 0) {
      completed.value = false
      promise.value = new Promise<void>((resolve) => {
        resolveCurrent = resolve
      })
    }
    count.value++
    error.value = null
  }

  /** Release one slot; superseded work cannot publish completion or errors. */
  function settle({ error: fetchError, current }: { error?: Error | null, current: boolean }) {
    // The counter is decremented first and unconditionally: `loading` must already read `false`
    // when watchers react to the `error` write, and a superseded request still has to give its
    // slot back or the lane would stay loading forever.
    count.value--

    if (current) {
      hasCurrentSettlement = true
      if (fetchError) {
        error.value = fetchError
      }
      else {
        lastUpdated.value = Date.now()
      }
    }

    // Resolved even for a superseded request, otherwise `await lane.promise` could never settle.
    if (count.value === 0) {
      completed.value = hasCurrentSettlement
      const resolve = resolveCurrent
      resolveCurrent = null
      resolve?.()
    }
  }

  return {
    count,
    error,
    completed,
    lastUpdated,
    promise,
    start,
    settle,
    recordSuccess: () => {
      hasCurrentSettlement = true
      lastUpdated.value = Date.now()
      completed.value = count.value === 0
    },
    clearError: () => {
      error.value = null
    },
    completeFromPush: (retainedError: Error | null = null, at = Date.now()) => {
      hasCurrentSettlement = true
      error.value = retainedError
      lastUpdated.value = at
      completed.value = count.value === 0
    },
    markIncomplete: () => {
      hasCurrentSettlement = false
      completed.value = false
    },
  }
}

/**
 * Build the query-level view of a lane. Uses refs so `const { loading } = query.foreground`
 * keeps working.
 */
export function toQueryFetchState(state: FetchStateController): VueQueryFetchState {
  return {
    loading: computed(() => state.count.value > 0),
    error: state.error,
    completed: state.completed,
    lastUpdated: state.lastUpdated,
    get promise() {
      return state.promise.value
    },
  }
}

/**
 * Build the page-level view of a lane. Uses plain values because `VueQueryPage` is a
 * `shallowReactive` object, which does not unwrap nested refs.
 */
export function toPageFetchState(state: FetchStateController): VueQueryPageFetchState {
  return {
    get loading() {
      return state.count.value > 0
    },
    get error() {
      return state.error.value
    },
    get completed() {
      return state.completed.value
    },
    get lastUpdated() {
      return state.lastUpdated.value
    },
    get promise() {
      return state.promise.value
    },
  }
}

/**
 * Whether a query result means "nothing to look at". Covers `null` (`findFirst`) and `[]`
 * (`findMany`), the two default values a query can hold before any data lands.
 */
export function isEmptyQueryData(value: unknown): boolean {
  if (value == null) {
    return true
  }
  if (Array.isArray(value)) {
    return value.length === 0
  }
  return false
}

/**
 * Friendly `loading` aggregate: whether the user is waiting on data. A background revalidation
 * only counts when there is nothing on screen yet - `getData` is deliberately called last so a
 * silent refresh over existing data never pays for reading the result.
 */
export function isFetchStateLoading(
  foreground: FetchStateController,
  background: FetchStateController,
  getData: () => unknown,
): boolean {
  return foreground.count.value > 0 || (background.count.value > 0 && isEmptyQueryData(getData()))
}

/**
 * Friendly `error` aggregate: a blocking failure takes precedence over a silent one.
 */
export function getFetchStateError(
  foreground: FetchStateController,
  background: FetchStateController,
): Error | null {
  return foreground.error.value ?? background.error.value
}

/** Settlement fields shared by foreground and background loads. */
type FetchSettlement = Parameters<FetchStateController['settle']>[0] & {
  /** Whether the transport response actually published an accepted page result. */
  published?: boolean
}

/** Active lane slots per page; detached transport work can finish later. */
const pageFetches = new WeakMap<object, Set<() => void>>()

/** Page that published the latest aggregate lane failure. */
interface FetchErrorOwner {
  /** Owning page, independent of whether providers reuse Error objects. */
  page: VueQueryPage<any, any, any, any, any>
  /** Published error, used only to detect unrelated manual replacement. */
  error: Error
}

/** Query lane ownership follows error publication without retaining dead queries. */
const fetchErrorOwners = new WeakMap<FetchStateController, FetchErrorOwner>()

/** Start a page load with an idempotent settlement that a push can supersede. */
export function startPageFetch(ctx: any, page: VueQueryPage<any, any, any, any, any>, background = false) {
  const queryLane = background ? ctx.background : ctx.foreground
  const pageLane = background ? page._background : page._foreground
  const pending = pageFetches.get(page) ?? new Set()
  pageFetches.set(page, pending)
  fetchErrorOwners.delete(queryLane)
  queryLane.start()
  pageLane.start()
  let finished = false
  /** Release loading once, without discarding a versioned response's later success. */
  function detach(): void {
    if (!pending.delete(detach))
      return
    queryLane.settle({ current: false })
    pageLane.settle({ current: false })
  }
  /** Settle transport once; a detached accepted response updates freshness only. */
  function finish(outcome: FetchSettlement): void {
    if (finished)
      return
    finished = true
    if (!pending.delete(detach)) {
      if (outcome.current && outcome.published && !outcome.error) {
        queryLane.recordSuccess()
        pageLane.recordSuccess()
      }
      return
    }
    if (outcome.current && outcome.error)
      fetchErrorOwners.set(queryLane, { page, error: outcome.error })
    queryLane.settle(outcome)
    pageLane.settle(outcome)
  }
  pending.add(detach)
  return finish
}

/** Snapshot only work that existed before publishing reactive page data. */
export function capturePageFetches(page: VueQueryPage<any, any, any, any, any>): Array<() => void> {
  return [...pageFetches.get(page) ?? []]
}

/** Complete the push without settling fetches started by synchronous observers. */
export function completePageFromPush(ctx: any, page: VueQueryPage<any, any, any, any, any>, fetches: Array<() => void>, isCurrent: () => boolean): void {
  const foregroundError = getRetainedPageError(ctx, page, 'foreground')
  const backgroundError = getRetainedPageError(ctx, page, 'background')
  for (const detach of fetches) {
    detach()
    if (!isCurrent())
      return
  }
  if (!foregroundError)
    fetchErrorOwners.delete(ctx.foreground)
  if (!backgroundError)
    fetchErrorOwners.delete(ctx.background)
  ctx.background.error.value = backgroundError
  if (!isCurrent())
    return
  page._background.clearError()
  if (!isCurrent())
    return
  // One stamp for both lanes: a clock tick in between would make the query
  // and its page disagree on when the push landed.
  const pushedAt = Date.now()
  ctx.foreground.completeFromPush(foregroundError, pushedAt)
  if (isCurrent())
    page._foreground.completeFromPush(null, pushedAt)
}

/** Preserve another page's failure without reviving explicitly dismissed errors. */
function getRetainedPageError(ctx: any, page: VueQueryPage<any, any, any, any, any>, lane: 'foreground' | 'background'): Error | null {
  const error = ctx[lane].error.value
  const owner = fetchErrorOwners.get(ctx[lane])
  return owner?.page === page && owner.error === error ? null : error
}
