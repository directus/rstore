import { runSyncTask, throwSyncErrors } from './syncErrors'

/** Cache-local scheduler for ownership effects invalidated by one publication. */
export interface TrackingEffectBatch {
  /** Publish one cache commit, then reconcile all affected ownership graphs. */
  run: (publish: () => void) => void
  /** Run now outside publication, or deduplicate until publication completes. */
  schedule: (effect: () => void) => void
  /** Remove a stopped query's pending reconciliation. */
  cancel: (effect: () => void) => void
  /** Adopt visible rows before an explicit public garbage collection. */
  flush: () => void
  /** Release pending callbacks when the cache is disposed. */
  clear: () => void
}

/** Batch expensive graph reads without delaying ownership until Vue's next tick. */
export function createTrackingEffectBatch(): TrackingEffectBatch {
  const pending = new Set<() => void>()
  let depth = 0
  let flushing = false

  /** Drain every live effect, preserving independent failures. */
  function flush(): void {
    if (flushing)
      return
    flushing = true
    let errors: unknown[] | undefined
    try {
      for (const effect of pending) {
        pending.delete(effect)
        errors = runSyncTask(effect, errors)
      }
    }
    finally {
      flushing = false
    }
    throwSyncErrors(errors, 'Query ownership synchronization failed')
  }

  return {
    run(publish) {
      depth++
      let errors: unknown[] | undefined
      try {
        errors = runSyncTask(publish, errors)
      }
      finally {
        depth--
        if (!depth)
          errors = runSyncTask(flush, errors)
      }
      throwSyncErrors(errors, 'Vue cache publication failed')
    },
    schedule(effect) {
      if (depth || flushing)
        pending.add(effect)
      else
        effect()
    },
    cancel: effect => pending.delete(effect),
    flush,
    clear: () => pending.clear(),
  }
}
