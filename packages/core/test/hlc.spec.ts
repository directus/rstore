import type { HLCTimestamp } from '../src/hlc'
import { describe, expect, it, vi } from 'vitest'
import {
  compareHLC,
  createHLCClock,
  getDefaultClock,
  HLCClockSkewError,
  HybridLogicalClock,
  parseHLC,
  setDefaultClock,
  stringifyHLC,
} from '../src/hlc'

describe('hybridLogicalClock', () => {
  it('should return monotonically increasing timestamps', () => {
    const clock = new HybridLogicalClock({ nodeId: 'a', physicalNow: () => 1000 })

    const first = clock.now()
    const second = clock.now()
    const third = clock.now()

    expect(compareHLC(second, first)).toBeGreaterThan(0)
    expect(compareHLC(third, second)).toBeGreaterThan(0)
  })

  it('should bump the logical counter when physical time stalls', () => {
    const clock = new HybridLogicalClock({ nodeId: 'a', physicalNow: () => 1000 })

    const a = clock.now()
    const b = clock.now()
    const c = clock.now()

    expect(a.physical).toBe(1000)
    expect(b.physical).toBe(1000)
    expect(c.physical).toBe(1000)
    expect(b.logical).toBe(a.logical + 1)
    expect(c.logical).toBe(b.logical + 1)
  })

  it('should advance physical time and reset logical when clock moves forward', () => {
    let physical = 1000
    const clock = new HybridLogicalClock({ nodeId: 'a', physicalNow: () => physical })

    clock.now()
    clock.now()
    physical = 2000
    const ts = clock.now()

    expect(ts.physical).toBe(2000)
    expect(ts.logical).toBe(0)
  })

  it('should absorb remote clocks on receive', () => {
    const clock = new HybridLogicalClock({ nodeId: 'a', physicalNow: () => 1000 })
    const remote = { physical: 5000, logical: 3, nodeId: 'b' }

    const merged = clock.receive(remote)

    expect(merged.physical).toBe(5000)
    expect(merged.logical).toBeGreaterThan(remote.logical)

    const next = clock.now()
    expect(next.physical).toBeGreaterThanOrEqual(5000)
  })

  it('should bump logical when receiving from our own physical time', () => {
    const clock = new HybridLogicalClock({ nodeId: 'a', physicalNow: () => 5000 })
    const first = clock.now() // physical 5000, logical 0
    const remote = { physical: 5000, logical: first.logical + 2, nodeId: 'b' }

    const merged = clock.receive(remote)

    expect(merged.physical).toBe(5000)
    expect(merged.logical).toBeGreaterThan(remote.logical)
  })

  describe('monotonicity guarantees', () => {
    it('should never emit a non-increasing timestamp even when physical clock moves backward', () => {
      let physical = 5000
      const clock = new HybridLogicalClock({ nodeId: 'a', physicalNow: () => physical })

      const a = clock.now()
      physical = 1000 // OS clock jumped backward (NTP correction, suspend/resume, etc.)
      const b = clock.now()
      physical = 500
      const c = clock.now()

      expect(compareHLC(b, a)).toBeGreaterThan(0)
      expect(compareHLC(c, b)).toBeGreaterThan(0)
      // Physical never regresses below the maximum we've observed.
      expect(b.physical).toBe(5000)
      expect(c.physical).toBe(5000)
    })

    it('should keep monotonicity across alternating receive/now calls', () => {
      let physical = 1000
      const clock = new HybridLogicalClock({ nodeId: 'a', physicalNow: () => physical })

      const stamps: HLCTimestamp[] = []
      stamps.push(clock.now())
      stamps.push(clock.receive({ physical: 1500, logical: 5, nodeId: 'b' }))
      physical = 1200
      stamps.push(clock.now())
      stamps.push(clock.receive({ physical: 800, logical: 2, nodeId: 'c' }))
      stamps.push(clock.now())

      for (let i = 1; i < stamps.length; i++) {
        expect(compareHLC(stamps[i]!, stamps[i - 1]!)).toBeGreaterThan(0)
      }
    })

    it('should produce a strictly greater stamp than the absorbed remote', () => {
      const clock = new HybridLogicalClock({ nodeId: 'a', physicalNow: () => 1000 })
      const remote = { physical: 2000, logical: 10, nodeId: 'b' }
      const merged = clock.receive(remote)
      expect(compareHLC(merged, remote)).toBeGreaterThan(0)
    })
  })

  describe('malformed remote input', () => {
    it('should reject a remote whose physical is NaN', () => {
      const clock = new HybridLogicalClock({ nodeId: 'a', physicalNow: () => 1000 })
      // NaN > Infinity returns false, so without an explicit guard the
      // skew check could silently accept a poison value. Document the
      // expectation: NaN is treated as "not a valid timestamp" and
      // rejected.
      expect(() => clock.receive({ physical: Number.NaN, logical: 0, nodeId: 'b' })).toThrow()
    })

    it('should reject a remote whose physical is Infinity', () => {
      const clock = new HybridLogicalClock({ nodeId: 'a', physicalNow: () => 1000 })
      expect(() => clock.receive({ physical: Number.POSITIVE_INFINITY, logical: 0, nodeId: 'b' })).toThrow()
    })

    it('should not advance state when malformed input is rejected', () => {
      const clock = new HybridLogicalClock({ nodeId: 'a', physicalNow: () => 1000 })
      const before = clock.now()
      try {
        clock.receive({ physical: Number.NaN, logical: 0, nodeId: 'b' })
      }
      catch {}
      const after = clock.now()
      // After NaN rejection, the clock is still at physical=1000 — only
      // the logical counter is bumped by the legitimate `now()` call.
      expect(after.physical).toBe(before.physical)
    })
  })

  describe('clock skew defense', () => {
    it('should reject remote timestamps too far in the future', () => {
      const clock = new HybridLogicalClock({
        nodeId: 'a',
        physicalNow: () => 1000,
        maxClockSkewMs: 60_000,
      })
      const farFuture = { physical: 1000 + 60_000 + 1, logical: 0, nodeId: 'evil' }

      expect(() => clock.receive(farFuture)).toThrow(HLCClockSkewError)
    })

    it('should accept remote timestamps within the skew window', () => {
      const clock = new HybridLogicalClock({
        nodeId: 'a',
        physicalNow: () => 1000,
        maxClockSkewMs: 60_000,
      })
      const justBelowLimit = { physical: 1000 + 60_000, logical: 0, nodeId: 'b' }

      const merged = clock.receive(justBelowLimit)
      expect(merged.physical).toBe(justBelowLimit.physical)
    })

    it('should not advance the local clock when a remote is rejected', () => {
      const clock = new HybridLogicalClock({
        nodeId: 'a',
        physicalNow: () => 1000,
        maxClockSkewMs: 5000,
      })
      // Drive the clock to a known state so we can detect mutations.
      const before = clock.now()
      const evil = { physical: 1_000_000_000, logical: 999, nodeId: 'evil' }

      try {
        clock.receive(evil)
      }
      catch {}

      const after = clock.now()
      // Without the defense, after.physical would jump to ~1e9. With it,
      // the local clock should still be near 1000.
      expect(after.physical).toBeLessThan(before.physical + 100)
    })

    it('should accept remote timestamps in the past without error', () => {
      const clock = new HybridLogicalClock({
        nodeId: 'a',
        physicalNow: () => 10_000,
        maxClockSkewMs: 60_000,
      })
      const past = { physical: 1, logical: 0, nodeId: 'b' }

      // Past timestamps cannot poison the clock — they're absorbed normally.
      expect(() => clock.receive(past)).not.toThrow()
    })

    it('should default to a sane skew limit when not configured', () => {
      const clock = new HybridLogicalClock({ nodeId: 'a', physicalNow: () => 0 })
      // 1 hour ahead is clearly malicious.
      const farFuture = { physical: 60 * 60 * 1000, logical: 0, nodeId: 'b' }
      expect(() => clock.receive(farFuture)).toThrow(HLCClockSkewError)
    })

    it('should allow disabling the skew defense via Infinity', () => {
      const clock = new HybridLogicalClock({
        nodeId: 'a',
        physicalNow: () => 0,
        maxClockSkewMs: Number.POSITIVE_INFINITY,
      })
      const farFuture = { physical: Number.MAX_SAFE_INTEGER - 1, logical: 0, nodeId: 'b' }
      expect(() => clock.receive(farFuture)).not.toThrow()
    })

    it('hLCClockSkewError carries skew details', () => {
      const clock = new HybridLogicalClock({
        nodeId: 'a',
        physicalNow: () => 1000,
        maxClockSkewMs: 5000,
      })
      const farFuture = { physical: 1_000_000, logical: 0, nodeId: 'evil' }

      try {
        clock.receive(farFuture)
        expect.fail('should have thrown')
      }
      catch (error) {
        expect(error).toBeInstanceOf(HLCClockSkewError)
        const e = error as HLCClockSkewError
        expect(e.remote).toEqual(farFuture)
        expect(e.localPhysical).toBe(1000)
        expect(e.skewMs).toBe(farFuture.physical - 1000)
        expect(e.maxClockSkewMs).toBe(5000)
      }
    })

    it('should invoke onClockSkew callback before throwing', () => {
      const onClockSkew = vi.fn()
      const clock = new HybridLogicalClock({
        nodeId: 'a',
        physicalNow: () => 1000,
        maxClockSkewMs: 5000,
        onClockSkew,
      })
      const farFuture = { physical: 1_000_000, logical: 0, nodeId: 'evil' }

      expect(() => clock.receive(farFuture)).toThrow(HLCClockSkewError)
      expect(onClockSkew).toHaveBeenCalledOnce()
      expect(onClockSkew).toHaveBeenCalledWith(expect.objectContaining({
        remote: farFuture,
        localPhysical: 1000,
        skewMs: farFuture.physical - 1000,
      }))
    })
  })
})

describe('compareHLC', () => {
  it('should order by physical time first', () => {
    const a = { physical: 100, logical: 0, nodeId: 'x' }
    const b = { physical: 200, logical: 0, nodeId: 'a' }
    expect(compareHLC(a, b)).toBeLessThan(0)
    expect(compareHLC(b, a)).toBeGreaterThan(0)
  })

  it('should order by logical when physical matches', () => {
    const a = { physical: 100, logical: 0, nodeId: 'x' }
    const b = { physical: 100, logical: 1, nodeId: 'a' }
    expect(compareHLC(a, b)).toBeLessThan(0)
  })

  it('should break ties deterministically by nodeId', () => {
    const a = { physical: 100, logical: 0, nodeId: 'alpha' }
    const b = { physical: 100, logical: 0, nodeId: 'beta' }
    expect(compareHLC(a, b)).toBeLessThan(0)
    expect(compareHLC(b, a)).toBeGreaterThan(0)
    expect(compareHLC(a, a)).toBe(0)
  })

  it('should accept serialized HLC strings', () => {
    const a = stringifyHLC({ physical: 100, logical: 0, nodeId: 'a' })
    const b = stringifyHLC({ physical: 200, logical: 0, nodeId: 'a' })
    expect(compareHLC(a, b)).toBeLessThan(0)
  })

  it('should coerce legacy numeric timestamps', () => {
    const a = 100
    const b = stringifyHLC({ physical: 200, logical: 0, nodeId: 'z' })
    expect(compareHLC(a, b)).toBeLessThan(0)
    expect(compareHLC(b, a)).toBeGreaterThan(0)
  })

  it('should treat equal numeric timestamps as equal', () => {
    expect(compareHLC(100, 100)).toBe(0)
  })
})

describe('stringifyHLC / parseHLC', () => {
  it('should round-trip', () => {
    const ts = { physical: 123456789, logical: 42, nodeId: 'node-x' }
    const str = stringifyHLC(ts)
    const parsed = parseHLC(str)
    expect(parsed).toEqual(ts)
  })

  it('should produce lexicographically comparable strings', () => {
    const a = stringifyHLC({ physical: 100, logical: 0, nodeId: 'a' })
    const b = stringifyHLC({ physical: 100, logical: 1, nodeId: 'a' })
    const c = stringifyHLC({ physical: 200, logical: 0, nodeId: 'a' })
    expect(a < b).toBe(true)
    expect(b < c).toBe(true)
  })

  it('should handle colons in nodeId by preserving them', () => {
    const ts = { physical: 1, logical: 0, nodeId: 'a:b:c' }
    expect(parseHLC(stringifyHLC(ts))).toEqual(ts)
  })
})

describe('createHLCClock + defaults', () => {
  it('should expose a default clock', () => {
    const d1 = getDefaultClock()
    const d2 = getDefaultClock()
    expect(d1).toBe(d2)
  })

  it('should allow overriding the default clock', () => {
    const previous = getDefaultClock()
    const custom = createHLCClock('custom-node')
    setDefaultClock(custom)
    expect(getDefaultClock()).toBe(custom)
    setDefaultClock(previous)
  })

  it('should generate unique node ids per clock', () => {
    const a = createHLCClock()
    const b = createHLCClock()
    expect(a.nodeId).not.toBe(b.nodeId)
  })
})
