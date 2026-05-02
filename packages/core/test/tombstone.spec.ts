import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stringifyHLC } from '../src/hlc'
import {
  createTombstoneStore,
  gcTombstones,
  isTombstone,
  scheduleTombstoneGc,
  shouldResurrect,
  tombstoneKey,
} from '../src/tombstone'

function hlc(physical: number, logical = 0, nodeId = 'n') {
  return stringifyHLC({ physical, logical, nodeId })
}

describe('tombstoneKey', () => {
  it('should include collection and key', () => {
    expect(tombstoneKey('users', 42)).toBe('users:42')
    expect(tombstoneKey('posts', 'abc')).toBe('posts:abc')
  })
})

describe('isTombstone', () => {
  it('should recognize tombstone shape', () => {
    expect(isTombstone({ collection: 'a', key: '1', deletedAt: hlc(1) })).toBe(true)
  })

  it('should reject other shapes', () => {
    expect(isTombstone(null)).toBe(false)
    expect(isTombstone({})).toBe(false)
    expect(isTombstone({ collection: 'a' })).toBe(false)
    expect(isTombstone({ collection: 'a', key: '1' })).toBe(false)
  })
})

describe('shouldResurrect', () => {
  it('should return true when update HLC is later than tombstone', () => {
    const tomb = { collection: 'a', key: '1', deletedAt: hlc(100) }
    expect(shouldResurrect(tomb, hlc(200))).toBe(true)
  })

  it('should return false when update HLC is earlier or equal', () => {
    const tomb = { collection: 'a', key: '1', deletedAt: hlc(200) }
    expect(shouldResurrect(tomb, hlc(100))).toBe(false)
    expect(shouldResurrect(tomb, hlc(200))).toBe(false)
  })

  it('should use the max timestamp across all field timestamps', () => {
    const tomb = { collection: 'a', key: '1', deletedAt: hlc(150) }
    const fieldTs = { a: hlc(100), b: hlc(200), c: hlc(50) }
    expect(shouldResurrect(tomb, fieldTs)).toBe(true)
  })

  it('should support legacy numeric timestamps', () => {
    const tomb = { collection: 'a', key: '1', deletedAt: hlc(100) }
    expect(shouldResurrect(tomb, hlc(200))).toBe(true)
  })
})

describe('createTombstoneStore', () => {
  it('should set and read tombstones', () => {
    const store = createTombstoneStore()
    const tomb = { collection: 'a', key: '1', deletedAt: hlc(100) }
    store.set(tomb)
    expect(store.get('a', '1')).toEqual(tomb)
  })

  it('should clear tombstones by key', () => {
    const store = createTombstoneStore()
    store.set({ collection: 'a', key: '1', deletedAt: hlc(100) })
    store.clear('a', '1')
    expect(store.get('a', '1')).toBeUndefined()
  })

  it('should return undefined for missing tombstones', () => {
    const store = createTombstoneStore()
    expect(store.get('a', '1')).toBeUndefined()
  })

  it('should only upgrade to a later tombstone on conflicting set', () => {
    const store = createTombstoneStore()
    const earlier = { collection: 'a', key: '1', deletedAt: hlc(100) }
    const later = { collection: 'a', key: '1', deletedAt: hlc(200) }
    store.set(later)
    store.set(earlier)
    expect(store.get('a', '1')).toEqual(later)
  })
})

describe('gcTombstones', () => {
  it('should return keys older than the cutoff', () => {
    const store = createTombstoneStore()
    store.set({ collection: 'a', key: '1', deletedAt: hlc(100) })
    store.set({ collection: 'a', key: '2', deletedAt: hlc(300) })
    const dropped = gcTombstones(store, hlc(200))
    expect(dropped).toEqual([{ collection: 'a', key: '1' }])
    expect(store.get('a', '1')).toBeUndefined()
    expect(store.get('a', '2')).toBeDefined()
  })

  it('should not drop a tombstone equal to the cutoff', () => {
    // The cutoff is exclusive (`<`), so a tombstone with deletedAt exactly
    // equal to it must survive. This pins the boundary so a future change
    // from `<` to `<=` would fail loudly.
    const store = createTombstoneStore()
    store.set({ collection: 'a', key: '1', deletedAt: hlc(200) })
    gcTombstones(store, hlc(200))
    expect(store.get('a', '1')).toBeDefined()
  })

  it('should be a no-op on an empty store', () => {
    const store = createTombstoneStore()
    const dropped = gcTombstones(store, hlc(1000))
    expect(dropped).toEqual([])
  })
})

describe('tombstone resurrection scenarios', () => {
  it('should suppress an update older than the tombstone (late delivery)', () => {
    // Peer A subscribes, misses a delete, then receives a stale update
    // for the deleted item from a slow upstream. The tombstone must keep
    // the row gone.
    const tomb = { collection: 'a', key: '1', deletedAt: hlc(500) }
    const lateUpdate = { title: hlc(400) }
    expect(shouldResurrect(tomb, lateUpdate)).toBe(false)
  })

  it('should resurrect when a peer races a write strictly after the delete', () => {
    const tomb = { collection: 'a', key: '1', deletedAt: hlc(500) }
    const racingUpdate = { title: hlc(501) }
    expect(shouldResurrect(tomb, racingUpdate)).toBe(true)
  })

  it('should pick the later tombstone when two peers concurrently delete the same key', () => {
    // Peer A deletes at HLC(100), peer B re-deletes at HLC(200) — the store
    // must hold the later tombstone regardless of insertion order.
    const store = createTombstoneStore()
    store.set({ collection: 'a', key: '1', deletedAt: hlc(100, 0, 'A') })
    store.set({ collection: 'a', key: '1', deletedAt: hlc(200, 0, 'B') })
    expect(store.get('a', '1')?.deletedAt).toBe(hlc(200, 0, 'B'))
  })

  it('should pick the lexicographically-greater nodeId on identical physical+logical', () => {
    // Two peers both delete at exactly the same physical+logical time.
    // The deterministic tiebreaker is the nodeId — the larger one wins.
    const store = createTombstoneStore()
    store.set({ collection: 'a', key: '1', deletedAt: hlc(100, 0, 'alpha') })
    store.set({ collection: 'a', key: '1', deletedAt: hlc(100, 0, 'beta') })
    expect(store.get('a', '1')?.deletedAt).toBe(hlc(100, 0, 'beta'))
    // And in the opposite order — the same later wins because `set`
    // refuses to downgrade.
    const store2 = createTombstoneStore()
    store2.set({ collection: 'a', key: '1', deletedAt: hlc(100, 0, 'beta') })
    store2.set({ collection: 'a', key: '1', deletedAt: hlc(100, 0, 'alpha') })
    expect(store2.get('a', '1')?.deletedAt).toBe(hlc(100, 0, 'beta'))
  })

  it('should resurrect when only one of several field timestamps beats the tombstone', () => {
    // Only one field needs to be newer for the row to come back.
    const tomb = { collection: 'a', key: '1', deletedAt: hlc(500) }
    const fieldTs = { title: hlc(400), body: hlc(600), tags: hlc(100) }
    expect(shouldResurrect(tomb, fieldTs)).toBe(true)
  })

  it('should not resurrect when every field timestamp is older than the tombstone', () => {
    const tomb = { collection: 'a', key: '1', deletedAt: hlc(500) }
    const fieldTs = { title: hlc(100), body: hlc(200), tags: hlc(300) }
    expect(shouldResurrect(tomb, fieldTs)).toBe(false)
  })

  it('should treat empty fieldTimestamps as "no resurrection signal"', () => {
    const tomb = { collection: 'a', key: '1', deletedAt: hlc(500) }
    expect(shouldResurrect(tomb, {})).toBe(false)
  })

  it('should allow legacy numeric timestamps to lose to an HLC tombstone', () => {
    // Legacy clients may send a bare number. With nodeId='' it sorts before
    // any HLC of the same physical, so a tombstone at the same physical
    // wins — no accidental resurrection from pre-HLC peers.
    const tomb = { collection: 'a', key: '1', deletedAt: hlc(500, 0, 'server') }
    expect(shouldResurrect(tomb, 500)).toBe(false)
    expect(shouldResurrect(tomb, 499)).toBe(false)
    expect(shouldResurrect(tomb, 501)).toBe(true)
  })
})

describe('scheduleTombstoneGc', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should periodically drop tombstones older than ttl', () => {
    const store = createTombstoneStore()
    const nowMs = 1_000_000

    const stop = scheduleTombstoneGc(store, {
      intervalMs: 1000,
      ttlMs: 5000,
      now: () => nowMs,
    })

    // Old tombstone — should be dropped on the next tick.
    store.set({ collection: 'a', key: 'old', deletedAt: hlc(nowMs - 10_000) })
    // Recent tombstone — should be kept.
    store.set({ collection: 'a', key: 'recent', deletedAt: hlc(nowMs - 1000) })

    vi.advanceTimersByTime(1000)

    expect(store.get('a', 'old')).toBeUndefined()
    expect(store.get('a', 'recent')).toBeDefined()

    stop()
  })

  it('should stop running when the returned cleanup is called', () => {
    const store = createTombstoneStore()
    const nowMs = 1_000_000
    const stop = scheduleTombstoneGc(store, {
      intervalMs: 1000,
      ttlMs: 5000,
      now: () => nowMs,
    })

    store.set({ collection: 'a', key: '1', deletedAt: hlc(nowMs - 10_000) })
    stop()

    // Without the stop, the next tick would drop this tombstone. With stop,
    // the timer is cleared.
    vi.advanceTimersByTime(10_000)

    expect(store.get('a', '1')).toBeDefined()
  })

  it('should invoke onSweep with the dropped count when provided', () => {
    const store = createTombstoneStore()
    const onSweep = vi.fn()
    const nowMs = 1_000_000

    const stop = scheduleTombstoneGc(store, {
      intervalMs: 1000,
      ttlMs: 5000,
      now: () => nowMs,
      onSweep,
    })

    store.set({ collection: 'a', key: '1', deletedAt: hlc(nowMs - 10_000) })
    store.set({ collection: 'a', key: '2', deletedAt: hlc(nowMs - 10_000) })

    vi.advanceTimersByTime(1000)

    expect(onSweep).toHaveBeenCalledOnce()
    expect(onSweep).toHaveBeenCalledWith({
      droppedCount: 2,
      cutoffMs: nowMs - 5000,
    })

    stop()
  })

  it('should be a no-op if all tombstones are within ttl', () => {
    const store = createTombstoneStore()
    const onSweep = vi.fn()
    const nowMs = 1_000_000

    const stop = scheduleTombstoneGc(store, {
      intervalMs: 1000,
      ttlMs: 5000,
      now: () => nowMs,
      onSweep,
    })

    store.set({ collection: 'a', key: '1', deletedAt: hlc(nowMs - 1000) })

    vi.advanceTimersByTime(1000)

    expect(store.get('a', '1')).toBeDefined()
    // onSweep is still called so callers can monitor activity, but with 0.
    expect(onSweep).toHaveBeenCalledWith({
      droppedCount: 0,
      cutoffMs: nowMs - 5000,
    })

    stop()
  })

  it('should reject non-positive intervals', () => {
    const store = createTombstoneStore()
    expect(() => scheduleTombstoneGc(store, { intervalMs: 0, ttlMs: 1000 })).toThrow()
    expect(() => scheduleTombstoneGc(store, { intervalMs: -1, ttlMs: 1000 })).toThrow()
  })
})
