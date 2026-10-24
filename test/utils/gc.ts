import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { expect } from 'vitest'

// `gc` is only exposed to contexts created after the flag is set.
setFlagsFromString('--expose-gc')

/** Force a full V8 garbage collection. */
export const collectGarbage: () => void = runInNewContext('gc')

/**
 * Let a real task and GC pass before testing whether an ended graph released.
 * A WeakRef can only clear after its last dereference's task has ended.
 */
export async function expectReleased(reference: WeakRef<object>): Promise<void> {
  await expect.poll(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
    collectGarbage()
    return reference.deref() === undefined
  }, { timeout: 3000 }).toBe(true)
}
