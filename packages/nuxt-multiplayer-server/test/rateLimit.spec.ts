import { describe, expect, it } from 'vitest'
import { PeerRateLimiter } from '../src/runtime/server/rateLimit'

describe('peerRateLimiter', () => {
  it('allows up to capacity within a tick', () => {
    const limiter = new PeerRateLimiter({ capacity: 3, refillPerSecond: 0 })
    const now = 1000
    expect(limiter.consume('a', now)).toBe(true)
    expect(limiter.consume('a', now)).toBe(true)
    expect(limiter.consume('a', now)).toBe(true)
    expect(limiter.consume('a', now)).toBe(false)
  })

  it('refills over time', () => {
    const limiter = new PeerRateLimiter({ capacity: 1, refillPerSecond: 1 })
    let now = 1000
    expect(limiter.consume('a', now)).toBe(true)
    expect(limiter.consume('a', now)).toBe(false)
    now += 1000
    expect(limiter.consume('a', now)).toBe(true)
  })

  it('tracks peers independently', () => {
    const limiter = new PeerRateLimiter({ capacity: 1, refillPerSecond: 0 })
    expect(limiter.consume('a', 0)).toBe(true)
    expect(limiter.consume('a', 0)).toBe(false)
    expect(limiter.consume('b', 0)).toBe(true)
  })
})
