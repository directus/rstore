import type { InspectionView } from '../runtime/types'

/** Fresh independent counters for one registration. */
export function createRevisions(): Record<InspectionView, number> {
  return { collections: 0, cache: 0, history: 0, subscriptions: 0, modules: 0, plugins: 0 }
}

/** Advance immediately and coalesce notifications within one microtask. */
export function createInvalidator(revisions: Record<InspectionView, number>, publish: (view: InspectionView, revision: number) => void) {
  const pending = new Set<InspectionView>()
  let active = true
  return {
    /** Record change while reads see latest revision immediately. */
    invalidate(view: InspectionView) {
      if (!active)
        return
      revisions[view]++
      if (pending.has(view))
        return
      pending.add(view)
      queueMicrotask(() => {
        if (active && pending.delete(view))
          publish(view, revisions[view])
      })
    },
    /** Prevent already-queued work from publishing after disposal. */
    dispose() {
      active = false
      pending.clear()
    },
  }
}
