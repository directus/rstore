import type fc from 'fast-check'

/**
 * Source of random choices shared by property tests (backed by fast-check,
 * so failures shrink and replay) and the fuzz harness (seeded PRNG, so a
 * failing run replays from its seed).
 */
export interface Random {
  /** Integer in `[min, max]`. */
  int: (min: number, max: number) => number
  /** One of the items. */
  pick: <T>(items: readonly T[]) => T
  /** `true` with probability `p`. */
  bool: (p?: number) => boolean
}

/** Mulberry32: tiny, fast, good enough for fuzzing. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: items => items[Math.floor(next() * items.length)]!,
    bool: (p = 0.5) => next() < p,
  }
}

/** Random choices drawn from a fast-check `gen()` value. */
export function fcRandom(g: fc.GeneratorValue, arbitraries: typeof fc): Random {
  return {
    int: (min, max) => g(arbitraries.integer, { min, max }),
    pick: items => items[g(arbitraries.integer, { min: 0, max: items.length - 1 })]!,
    bool: (p = 0.5) => g(arbitraries.integer, { min: 0, max: 999 }) < p * 1000,
  }
}
