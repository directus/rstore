import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCollection, createTestEngine } from './helpers'

describe('store-engine: staggering & pause', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('applies writes stepwise within the per-window budget', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection], { cacheStaggering: 2 })

    for (let i = 1; i <= 5; i++) {
      engine.writeItem({ collection, key: i, item: { id: i } })
    }

    // Only the first 2 are applied synchronously.
    expect(engine.resolveKeys({ collection })).toEqual([1, 2])

    vi.advanceTimersByTime(10)
    expect(engine.resolveKeys({ collection })).toEqual([1, 2, 3, 4])

    vi.advanceTimersByTime(10)
    expect(engine.resolveKeys({ collection })).toEqual([1, 2, 3, 4, 5])
  })

  it('does not apply queued writes while paused, then flushes on resume', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    engine.pause()
    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    engine.writeItem({ collection, key: 2, item: { id: 2 } })
    expect(engine.resolveKeys({ collection })).toEqual([])

    engine.resume()
    expect(engine.resolveKeys({ collection })).toEqual([1, 2])
  })

  it('clears the budget-reset timer on dispose so queued writes never apply', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection], { cacheStaggering: 2 })

    for (let i = 1; i <= 5; i++) {
      engine.writeItem({ collection, key: i, item: { id: i } })
    }
    // Budget exhausted after 2; the rest are queued behind a pending reset timer.
    expect(engine.resolveKeys({ collection })).toEqual([1, 2])

    engine.dispose()
    vi.advanceTimersByTime(50)

    // The pending timer was cancelled: no late flush re-drove the queue.
    expect(engine.resolveKeys({ collection })).toEqual([1, 2])
  })
})
