import type { HLCClockSkewInfo, HLCTimestamp, HybridLogicalClockOptions } from './types.js'
import { HLCClockSkewError } from './error.js'
import { createNodeId } from './nodeId.js'
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
      this.rejectClockSkew(remote, nowPhysical, Number.POSITIVE_INFINITY)
    }

    const skewMs = remote.physical - nowPhysical
    if (skewMs > this.maxClockSkewMs) {
      this.rejectClockSkew(remote, nowPhysical, skewMs)
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

  /**
   * Notify the skew observer and reject a remote timestamp before state changes.
   *
   * @param remote Remote timestamp that violated clock validation.
   * @param localPhysical Local clock reading at validation time.
   * @param skewMs Measured skew, or positive infinity for malformed input.
   */
  private rejectClockSkew(remote: HLCTimestamp, localPhysical: number, skewMs: number): never {
    const info: HLCClockSkewInfo = {
      remote,
      localPhysical,
      skewMs,
      maxClockSkewMs: this.maxClockSkewMs,
    }
    this.onClockSkew?.(info)
    throw new HLCClockSkewError(info)
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
 *
 * Prefer passing a clock explicitly: a process-wide clock is shared by every
 * store and server instance of the process (Q13 in the multiplayer plan).
 * Kept for `@rstore/nuxt-drizzle` until it owns its clock.
 */
export function getDefaultClock(): HybridLogicalClock {
  defaultClock ??= new HybridLogicalClock()
  return defaultClock
}

/**
 * Override the process-wide default clock.
 *
 * See {@link getDefaultClock}: prefer an explicit clock instance.
 */
export function setDefaultClock(clock: HybridLogicalClock): void {
  defaultClock = clock
}
