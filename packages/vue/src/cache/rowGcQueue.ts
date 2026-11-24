import { nextTick } from 'vue'

/** Combine managed row releases from different queries into one policy pass. */
export function createRowGcQueue(sweep: (collections: ReadonlySet<string>) => void, schedule: (flush: () => void) => void = flush => void nextTick(flush)) {
  let pending: Set<string> | undefined
  return (collection: string) => {
    if (!pending) {
      pending = new Set()
      schedule(() => {
        const names = pending!
        pending = undefined
        sweep(names)
      })
    }
    pending.add(collection)
  }
}
