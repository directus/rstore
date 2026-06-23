import type { HLCClockSkewInfo, HLCTimestamp } from './types.js'

/**
 * Error thrown when a received HLC timestamp is too far in the future.
 */
export class HLCClockSkewError extends Error implements HLCClockSkewInfo {
  readonly remote: HLCTimestamp
  readonly localPhysical: number
  readonly skewMs: number
  readonly maxClockSkewMs: number

  constructor(info: HLCClockSkewInfo) {
    super(
      `HLC clock skew of ${info.skewMs}ms from node "${info.remote.nodeId}" exceeds limit of ${info.maxClockSkewMs}ms`,
    )
    this.name = 'HLCClockSkewError'
    this.remote = info.remote
    this.localPhysical = info.localPhysical
    this.skewMs = info.skewMs
    this.maxClockSkewMs = info.maxClockSkewMs
  }
}
