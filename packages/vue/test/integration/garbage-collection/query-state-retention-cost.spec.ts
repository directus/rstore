import { describe, expect, it, vi } from 'vitest'
// eslint-disable-next-line no-restricted-imports -- Sweep cost has no public signal; all behavior uses public APIs.
import { isQueryStateHeld } from '../../../src/cache/queryHolders'
import { createGarbageCollectionStack, todoSchema } from './utils'

// Count liveness checks: each retention sweep checks every saved query id.
vi.mock('../../../src/cache/queryHolders', async importOriginal => ({
  ...await importOriginal<typeof import('../../../src/cache/queryHolders')>(),
  isQueryStateHeld: vi.fn((await importOriginal<typeof import('../../../src/cache/queryHolders')>()).isQueryStateHeld),
}))

describe('saved query state retention cost', () => {
  it('does not sweep on every save while mounted queries alone exceed the size limit', async () => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [] },
      queryStateRetention: { maxSize: 5 },
    })
    vi.mocked(isQueryStateHeld).mockClear()

    for (let index = 0; index < 50; index++) {
      await stack.run(() => stack.store.todos.query((q: any) => q.first(`miss-${index}`)))
      await Promise.resolve()
    }

    // A sweep per save checks ~2,500 ids. Sweeping once per `maxSize` new
    // mounted queries checks ~200.
    expect(vi.mocked(isQueryStateHeld).mock.calls.length).toBeLessThan(300)
  })
})
