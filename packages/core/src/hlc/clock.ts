import type { HLCTimestamp, HybridLogicalClockOptions } from './types.js'
import { createNodeId } from '../utils/nodeId.js'
import { HLCClockSkewError } from './error.js'
import { DEFAULT_MAX_CLOCK_SKEW_MS } from './types.js'

/**
 * Hybrid Logical Clock (HLC) instance.
 */
export class HybridLogicalClock {
  readonly nodeId: string
  private readonly physicalNow: () => number
  private readonly maxClockSkewMs: number
  private readonly onClockSkew?: HybridLogicalClockOptions['onClockSkew']
  private lastPhysical = 0
  private lastLogical = 0

  constructor(options: HybridLogicalClockOptions = {}) {
    this.nodeId = options.nodeId ?? createNodeId()
    this.physicalNow = options.physicalNow ?? (() => Date.now())
    this.maxClockSkewMs = options.maxClockSkewMs ?? DEFAULT_MAX_CLOCK_SKEW_MS
    this.onClockSkew = options.onClockSkew
  }

  /**
   * Emit a timestamp that is strictly greater than the previous local event.
   */
  now(): HLCTimestamp {
    const nowPhysical = this.physicalNow()
    if (nowPhysical > this.lastPhysical) {
      this.lastPhysical = nowPhysical
      this.lastLogical = 0
    }
    else {
      this.lastLogical += 1
    }
    return { physical: this.lastPhysical, logical: this.lastLogical, nodeId: this.nodeId }
  }

  /**
   * Absorb a remote timestamp and return the next local timestamp.
   *
   * Remote timestamps too far in the future are rejected before state mutates.
   */
  receive(remote: HLCTimestamp): HLCTimestamp {
    const nowPhysical = this.physicalNow()

    if (!Number.isFinite(remote.physical)) {
      const info = {
        remote,
        localPhysical: nowPhysical,
        skewMs: Number.POSITIVE_INFINITY,
        maxClockSkewMs: this.maxClockSkewMs,
      }
      this.onClockSkew?.(info)
      throw new HLCClockSkewError(info)
    }

    const skewMs = remote.physical - nowPhysical
    if (skewMs > this.maxClockSkewMs) {
      const info = {
        remote,
        localPhysical: nowPhysical,
        skewMs,
        maxClockSkewMs: this.maxClockSkewMs,
      }
      this.onClockSkew?.(info)
      throw new HLCClockSkewError(info)
    }

    const nextPhysical = Math.max(nowPhysical, this.lastPhysical, remote.physical)
    let nextLogical: number

    if (nextPhysical === this.lastPhysical && nextPhysical === remote.physical) {
      nextLogical = Math.max(this.lastLogical, remote.logical) + 1
    }
    else if (nextPhysical === this.lastPhysical) {
      nextLogical = this.lastLogical + 1
    }
    else if (nextPhysical === remote.physical) {
      nextLogical = remote.logical + 1
    }
    else {
      nextLogical = 0
    }

    this.lastPhysical = nextPhysical
    this.lastLogical = nextLogical
    return { physical: nextPhysical, logical: nextLogical, nodeId: this.nodeId }
  }
}

/**
 * Create a fresh {@link HybridLogicalClock}.
 */
export function createHLCClock(nodeId?: string): HybridLogicalClock {
  return new HybridLogicalClock({ nodeId })
}

let defaultClock: HybridLogicalClock | null = null

/**
 * Get and lazily create the process-wide default clock.
 */
export function getDefaultClock(): HybridLogicalClock {
  defaultClock ??= new HybridLogicalClock()
  return defaultClock
}

/**
 * Override the process-wide default clock.
 */
export function setDefaultClock(clock: HybridLogicalClock): void {
  defaultClock = clock
}
