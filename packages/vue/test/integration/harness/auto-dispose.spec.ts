import type { VueStack } from '#test-utils/store/vueStack'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { harnessSchema } from './shared'

/** Stack opened by the producer test and inspected after onTestFinished runs. */
let previous: VueStack | undefined

// The suite itself opts out of shuffling because test two observes cleanup
// registered at the end of test one; unrelated harness specs still shuffle.
describe('stack auto dispose', { concurrent: false, shuffle: false }, () => {
  it('opens a live query with no manual teardown', async () => {
    previous = await createVueStack({ schema: harnessSchema, data: { todos: [] } })
    await previous.run(() => previous!.store.todos.liveQuery((q: any) => q.many()))
    await vi.waitFor(() => expect(previous!.remote.subscriptions()).toHaveLength(1))
  })

  it('releases the prior stack at test finish', async () => {
    expect(previous).toBeDefined()
    await vi.waitFor(() => expect(previous!.remote.subscriptions()).toEqual([]))
  })
})
