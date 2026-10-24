import type { GlobalStoreType, RetentionOptions, StoreCore } from '@rstore/shared'
import { expectReleased } from '#test-utils/gc'
import { createCoreStack } from '#test-utils/store/coreStack'
import { defineModule } from '@rstore/core'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

/** Store with a module mutation recording `{ index }` payloads. */
async function setup(mutationHistory?: false | RetentionOptions) {
  const { store } = await createCoreStack({ factory: 'core', schema: [{ name: 'todos' }], remote: false, syncImmediately: false, mutationHistory })
  const module = defineModule<{ name: 'log', state: any }, any, any>(store as GlobalStoreType as any, 'log', ({ defineMutation }) => ({
    write: defineMutation((_entry: { index: number }) => {}),
  }))()
  return { store, module }
}

/** Indexes recorded in the history, oldest first. */
function recorded(store: StoreCore<any, any>) {
  return store.$mutationHistory.map(entry => (entry.payload as Array<{ index: number }>)[0]!.index)
}

/** Fake `Date` only (mutations still await real microtasks) for this test. */
function useFakeDate() {
  vi.useFakeTimers({ toFake: ['Date'] })
  onTestFinished(() => {
    vi.useRealTimers()
  })
}

describe('$mutationHistory', () => {
  it('keeps only the latest entries and releases the oldest payload', async () => {
    const { store, module } = await setup()

    module.write({ index: 0 })
    // Every entry keeps its call arguments: the oldest must go once evicted.
    const oldestPayload = new WeakRef(store.$mutationHistory[0]!.payload as object)
    for (let index = 1; index < 1000; index++) {
      module.write({ index })
    }

    expect(store.$mutationHistory.length).toBeLessThan(1000)
    expect(store.$mutationHistory.at(-1)!.payload).toEqual([{ index: 999 }])
    await expectReleased(oldestPayload)
  })

  it('keeps the configured number of entries', async () => {
    const { store, module } = await setup({ maxSize: 2 })

    for (const index of [1, 2, 3])
      module.write({ index })

    expect(recorded(store)).toEqual([2, 3])
  })

  it('drops entries older than the configured TTL', async () => {
    useFakeDate()
    const { store, module } = await setup({ ttlMs: 1_000 })

    module.write({ index: 1 })
    vi.advanceTimersByTime(600)
    module.write({ index: 2 })
    vi.advanceTimersByTime(600)
    module.write({ index: 3 })

    expect(recorded(store)).toEqual([2, 3])
  })

  it('records nothing with a zero size limit', async () => {
    const { store, module } = await setup({ maxSize: 0 })

    module.write({ index: 1 })

    expect(store.$mutationHistory).toEqual([])
  })

  it('keeps every entry when retention is `false`', async () => {
    const { store, module } = await setup(false)

    for (let index = 0; index < 30; index++)
      module.write({ index })

    expect(recorded(store)).toEqual(Array.from({ length: 30 }, (_, index) => index))
  })

  it('evicts by position, letting an externally pushed entry expire with the later ones', async () => {
    useFakeDate()
    const { store, module } = await setup({ ttlMs: 1_000 })

    // Pushed without going through a mutation: its recording time is unknown.
    store.$mutationHistory.push({ operation: 'module-mutation', module: 'log', key: 'write', payload: [{ index: 0 }] })
    module.write({ index: 1 })
    vi.advanceTimersByTime(1_100)
    module.write({ index: 2 })

    expect(recorded(store)).toEqual([2])
  })

  it('keeps entries the clock still considers recent after it went backwards', async () => {
    useFakeDate()
    const { store, module } = await setup({ ttlMs: 1_000 })

    vi.setSystemTime(5_000)
    module.write({ index: 1 })
    vi.setSystemTime(0)
    module.write({ index: 2 })
    vi.setSystemTime(1_500)
    module.write({ index: 3 })

    expect(recorded(store)).toEqual([1, 2, 3])
  })

  it('validates retention assigned at runtime and fills omitted limits from defaults', async () => {
    const { store } = await setup()

    store.$mutationHistoryRetention = { maxSize: 5 }
    expect(store.$mutationHistoryRetention).toEqual({ ttlMs: 600_000, maxSize: 5 })
    expect(() => {
      store.$mutationHistoryRetention = { ttlMs: 0 }
    }).toThrow(TypeError)
    expect(store.$mutationHistoryRetention).toEqual({ ttlMs: 600_000, maxSize: 5 })
  })
})
