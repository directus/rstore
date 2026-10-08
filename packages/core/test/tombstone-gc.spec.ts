import type { TombstoneGcSweepInfo } from '../src'
import { waitForTombstoneSweeps } from '#test-utils/tombstoneSweeps'
import { describe, expect, it, vi } from 'vitest'
import { createTombstoneStore, gcTombstones, scheduleTombstoneGc, stringifyHLC } from '../src'

/** Encode an HLC timestamp for the timer scenarios. */
function hlc(physical: number): string {
  return stringifyHLC({ physical, logical: 0, nodeId: 'test' })
}

describe('tombstone garbage collection', () => {
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

  it('uses the current injected clock on each real sweep and reports zero drops', async () => {
    const store = createTombstoneStore()
    const sweeps: TombstoneGcSweepInfo[] = []
    let now = 10_000
    const stop = scheduleTombstoneGc(store, {
      intervalMs: 5,
      ttlMs: 1_000,
      now: () => now,
      onSweep: sweep => sweeps.push(sweep),
    })
    try {
      store.set({ collection: 'todos', key: 'recent', deletedAt: hlc(9_500) })
      await vi.waitFor(() => expect(sweeps[0], 'first real sweep must report zero drops').toEqual({ droppedCount: 0, cutoffMs: 9_000 }))
      expect(store.get('todos', 'recent')).toBeDefined()

      now = 12_000
      await vi.waitFor(() => expect(sweeps, 'next sweep must use updated clock').toContainEqual({ droppedCount: 1, cutoffMs: 11_000 }))
      expect(store.get('todos', 'recent')).toBeUndefined()
    }
    finally {
      stop()
    }
  })

  it('rejects exact non-positive intervals', () => {
    const store = createTombstoneStore()
    expect(() => scheduleTombstoneGc(store, { intervalMs: 0, ttlMs: 1_000 })).toThrow('intervalMs must be > 0 (received 0)')
    expect(() => scheduleTombstoneGc(store, { intervalMs: -1, ttlMs: 1_000 })).toThrow('intervalMs must be > 0 (received -1)')
  })

  it('returns an idempotent stop function that prevents later real sweeps', async () => {
    const store = createTombstoneStore()
    let sweeps = 0
    const stop = scheduleTombstoneGc(store, { intervalMs: 5, ttlMs: 1_000, now: () => 10_000, onSweep: () => sweeps++ })
    try {
      await vi.waitFor(() => expect(sweeps, 'collector must run before stopping').toBeGreaterThan(0))
      stop()
      stop()
      const stoppedSweeps = sweeps
      store.set({ collection: 'todos', key: 'old', deletedAt: hlc(1) })

      await waitForTombstoneSweeps(5)
      expect(store.get('todos', 'old'), 'stopped collector must retain eligible tombstone').toBeDefined()
      expect(sweeps, 'stopped collector must publish no later sweep').toBe(stoppedSweeps)
    }
    finally {
      stop()
    }
  })
})
