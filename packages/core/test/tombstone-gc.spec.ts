import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTombstoneStore, gcTombstones, scheduleTombstoneGc, stringifyHLC } from '../src'

/** Encode an HLC timestamp for the timer scenarios. */
function hlc(physical: number): string {
  return stringifyHLC({ physical, logical: 0, nodeId: 'test' })
}

describe('tombstone garbage collection', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('uses an exclusive cutoff for older, equal, newer, and numeric tombstones', () => {
    const store = createTombstoneStore()
    store.set({ collection: 'todos', key: 'old', deletedAt: hlc(100) })
    store.set({ collection: 'todos', key: 'equal', deletedAt: hlc(200) })
    store.set({ collection: 'todos', key: 'new', deletedAt: hlc(300) })
    store.set({ collection: 'todos', key: 'legacy', deletedAt: 100 })

    expect(gcTombstones(store, hlc(200))).toEqual([
      { collection: 'todos', key: 'old' },
      { collection: 'todos', key: 'legacy' },
    ])
    expect(store.get('todos', 'equal')).toBeDefined()
    expect(store.get('todos', 'new')).toBeDefined()
  })

  it('uses the current injected clock on each sweep and reports zero drops', () => {
    const store = createTombstoneStore()
    const sweeps: any[] = []
    let now = 10_000
    const stop = scheduleTombstoneGc(store, {
      intervalMs: 100,
      ttlMs: 1_000,
      now: () => now,
      onSweep: sweep => sweeps.push(sweep),
    })
    store.set({ collection: 'todos', key: 'recent', deletedAt: hlc(9_500) })

    vi.advanceTimersByTime(100)
    expect(store.get('todos', 'recent')).toBeDefined()
    expect(sweeps).toEqual([{ droppedCount: 0, cutoffMs: 9_000 }])

    now = 12_000
    vi.advanceTimersByTime(100)
    expect(store.get('todos', 'recent')).toBeUndefined()
    expect(sweeps[1]).toEqual({ droppedCount: 1, cutoffMs: 11_000 })
    stop()
  })

  it('rejects exact non-positive intervals', () => {
    const store = createTombstoneStore()
    expect(() => scheduleTombstoneGc(store, { intervalMs: 0, ttlMs: 1_000 })).toThrow('intervalMs must be > 0 (received 0)')
    expect(() => scheduleTombstoneGc(store, { intervalMs: -1, ttlMs: 1_000 })).toThrow('intervalMs must be > 0 (received -1)')
  })

  it('returns an idempotent stop function', () => {
    const store = createTombstoneStore()
    const stop = scheduleTombstoneGc(store, { intervalMs: 100, ttlMs: 1_000, now: () => 10_000 })
    store.set({ collection: 'todos', key: 'old', deletedAt: hlc(1) })
    stop()
    stop()

    vi.advanceTimersByTime(1_000)
    expect(store.get('todos', 'old')).toBeDefined()
  })
})
