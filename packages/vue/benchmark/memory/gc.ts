import process from 'node:process'

/** Explicit garbage-collector callback supplied by Node with `--expose-gc`. */
export type ExposedGc = () => void

/** Reject memory measurement without explicit forced-GC support. */
export function assertExposedGc(gc: ExposedGc | undefined = globalThis.gc): asserts gc is ExposedGc {
  if (typeof gc !== 'function')
    throw new Error('Memory benchmark requires node --expose-gc')
}

/** Yield one event-loop turn so completed reactive work releases stack roots. */
export async function settleEventLoop(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve))
}

/** Capture lowest heap reading across five forced collections. */
export async function captureStableHeap(gc: ExposedGc | undefined = globalThis.gc): Promise<number> {
  assertExposedGc(gc)
  await settleEventLoop()
  let minimum = Number.POSITIVE_INFINITY
  for (let index = 0; index < 5; index++) {
    gc()
    minimum = Math.min(minimum, process.memoryUsage().heapUsed)
  }
  if (!Number.isFinite(minimum))
    throw new Error('Memory benchmark did not capture a finite heap reading')
  return minimum
}
