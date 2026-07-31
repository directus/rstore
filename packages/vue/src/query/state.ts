import type { FetchStateController, VueQueryFetchState, VueQueryPageFetchState } from './types'
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

  function start() {
    if (count.value === 0) {
      completed.value = false
      promise.value = new Promise<void>((resolve) => {
        resolveCurrent = resolve
      })
    }
    count.value++
    error.value = null
  }

  function settle({ error: fetchError, current }: { error?: Error | null, current: boolean }) {
    // The counter is decremented first and unconditionally: `loading` must already read `false`
    // when watchers react to the `error` write, and a superseded request still has to give its
    // slot back or the lane would stay loading forever.
    count.value--

    if (current) {
      if (fetchError) {
        error.value = fetchError
      }
      else {
        lastUpdated.value = Date.now()
      }
      if (count.value === 0) {
        completed.value = true
      }
    }

    // Resolved even for a superseded request, otherwise `await lane.promise` could never settle.
    if (count.value === 0) {
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
    clearError: () => {
      error.value = null
    },
    markIncomplete: () => {
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
