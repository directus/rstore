import type { Staggering } from './internal-types.js'

/** Create the cache write-staggering controller. */
export function createStaggering(cacheStaggering: number): Staggering {
  const budgetMax = Math.max(0, Math.floor(cacheStaggering))
  let budget = budgetMax
  let resetTimer: ReturnType<typeof setTimeout> | undefined
  let flush: (() => void) | undefined
  let disposed = false

  /** Schedule one budget reset and queue retry. */
  function scheduleReset(): void {
    if (!budgetMax || resetTimer)
      return
    resetTimer = setTimeout(() => {
      resetTimer = undefined
      budget = budgetMax
      flush?.()
    }, 10)
  }

  return {
    enabled: budgetMax > 0,
    canProcess() {
      if (disposed || !budgetMax || budget > 0)
        return true
      scheduleReset()
      return false
    },
    consume() {
      if (budgetMax && !disposed) {
        scheduleReset()
        budget = Math.max(0, budget - 1)
      }
    },
    setFlush(callback) {
      flush = callback
    },
    dispose() {
      disposed = true
      if (resetTimer)
        clearTimeout(resetTimer)
      resetTimer = undefined
    },
  }
}
