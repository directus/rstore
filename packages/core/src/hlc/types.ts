/**
 * Hybrid Logical Clock (HLC) timestamp.
 */
export interface HLCTimestamp {
  /** Wall-clock reading in milliseconds. */
  physical: number
  /** Monotonic counter used when physical time repeats. */
  logical: number
  /** Identifier of the emitting clock used to break ties deterministically. */
  nodeId: string
}

/**
 * Serialized HLC timestamp.
 *
 * Form: `"{physicalHex}:{logicalHex}:{nodeId}"`. Both numeric components are
 * zero-padded hex so lexicographic comparison agrees with causal ordering.
 */
export type HLCString = string

/**
 * Legacy value accepted by field-level LWW merge paths.
 */
export type FieldTimestampValue = number | HLCString

/**
 * Diagnostic payload produced when a remote HLC timestamp is too far ahead.
 */
export interface HLCClockSkewInfo {
  /** Remote timestamp that triggered the skew. */
  remote: HLCTimestamp
  /** Local physical clock reading at detection time. */
  localPhysical: number
  /** `remote.physical - localPhysical`. */
  skewMs: number
  /** Configured tolerated skew in milliseconds. */
  maxClockSkewMs: number
}

/**
 * Default tolerated clock skew between this node and a remote peer.
 */
export const DEFAULT_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

/**
 * Options for constructing a {@link import('./clock.js').HybridLogicalClock}.
 */
export interface HybridLogicalClockOptions {
  /** Explicit node identifier. Defaults to a random id. */
  nodeId?: string
  /** Physical clock source. Defaults to `Date.now`. */
  physicalNow?: () => number
  /**
   * Maximum tolerated skew between this clock and received remote timestamps.
   */
  maxClockSkewMs?: number
  /** Observer fired before a skew rejection is thrown. */
  onClockSkew?: (info: HLCClockSkewInfo) => void
}
