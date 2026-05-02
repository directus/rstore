/**
 * Hybrid Logical Clock (HLC) — Kulkarni/Demirbas 2014.
 *
 * Produces timestamps that order causally across distributed nodes without
 * relying on synchronized physical clocks. A timestamp is a tuple of
 * `(physical, logical, nodeId)`:
 *
 * - `physical` is a millisecond-precision wall-clock reading, monotonically
 *   non-decreasing on each clock (it never goes backward even if the
 *   underlying OS clock does).
 * - `logical` increments whenever two events share the same physical time,
 *   so timestamps within a quiescent millisecond remain strictly ordered.
 * - `nodeId` breaks ties between concurrent events on different peers,
 *   giving every pair of timestamps a deterministic total order.
 *
 * See {@link compareHLC}, {@link stringifyHLC}, {@link parseHLC}.
 */

/** A point in HLC time. */
export interface HLCTimestamp {
  /** Wall-clock reading in milliseconds. */
  physical: number
  /** Monotonic counter used when physical time repeats. */
  logical: number
  /** Identifier of the emitting clock — used to break ties deterministically. */
  nodeId: string
}

/**
 * Serialized HLC timestamp.
 *
 * Form: `"{physicalHex}:{logicalHex}:{nodeId}"`. Both numeric components are
 * zero-padded hex (12 + 4 digits) so that lexicographic comparison of two
 * serialized timestamps agrees with causal ordering even when the values are
 * stored or transmitted as plain strings.
 */
export type HLCString = string

/**
 * Legacy value accepted by the LWW field-merge path. A bare number `n`
 * is treated as HLC `{physical: n, logical: 0, nodeId: ''}`, which keeps
 * pre-HLC data comparable against fresh HLC timestamps.
 */
export type FieldTimestampValue = number | HLCString

/**
 * Diagnostic payload passed to {@link HybridLogicalClockOptions.onClockSkew}.
 */
export interface HLCClockSkewInfo {
  /** The remote timestamp that triggered the skew. */
  remote: HLCTimestamp
  /** Local physical clock reading at the moment the skew was detected. */
  localPhysical: number
  /** `remote.physical - localPhysical` (always > {@link maxClockSkewMs}). */
  skewMs: number
  /** Configured limit at the time of detection. */
  maxClockSkewMs: number
}

/**
 * Thrown by {@link HybridLogicalClock.receive} when a remote timestamp's
 * physical component exceeds the local clock by more than the configured
 * skew. Catch this at the realtime ingest boundary and either drop the
 * frame or surface it as a protocol error — silently absorbing it would
 * let a single peer poison every other clock in the system.
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

/**
 * Default tolerated clock skew between this node and a remote peer (ms).
 * Chosen to comfortably cover NTP-grade clock drift while still rejecting
 * anything that looks like a clock-poisoning attack.
 */
export const DEFAULT_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

/** Options for constructing a {@link HybridLogicalClock}. */
export interface HybridLogicalClockOptions {
  nodeId?: string
  physicalNow?: () => number
  /**
   * Maximum tolerated skew between this clock's physical time and the
   * `physical` component of a received remote timestamp. Pass
   * `Number.POSITIVE_INFINITY` to disable the check (only safe on a fully
   * trusted internal network). Defaults to {@link DEFAULT_MAX_CLOCK_SKEW_MS}.
   */
  maxClockSkewMs?: number
  /**
   * Optional observer fired when a remote timestamp is rejected for
   * exceeding {@link maxClockSkewMs}. Useful for logging / metrics. The
   * receive call still throws after this runs.
   */
  onClockSkew?: (info: HLCClockSkewInfo) => void
}

const PHYSICAL_DIGITS = 12
const LOGICAL_DIGITS = 4

/**
 * Generate a short-ish random identifier for a clock.
 * Uses `crypto.randomUUID()` when available and falls back to a time-based id.
 */
function createNodeId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } }
  if (g.crypto?.randomUUID) {
    return g.crypto.randomUUID()
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
}

/** A hybrid logical clock instance. */
export class HybridLogicalClock {
  readonly nodeId: string
  private readonly physicalNow: () => number
  private readonly maxClockSkewMs: number
  private readonly onClockSkew?: (info: HLCClockSkewInfo) => void
  private lastPhysical = 0
  private lastLogical = 0

  constructor(options: HybridLogicalClockOptions = {}) {
    this.nodeId = options.nodeId ?? createNodeId()
    this.physicalNow = options.physicalNow ?? (() => Date.now())
    this.maxClockSkewMs = options.maxClockSkewMs ?? DEFAULT_MAX_CLOCK_SKEW_MS
    this.onClockSkew = options.onClockSkew
  }

  /**
   * Emit a new timestamp representing "now" on this clock.
   * Never returns a timestamp that is <= the previously emitted one.
   */
  now(): HLCTimestamp {
    const nowPhysical = this.physicalNow()
    if (nowPhysical > this.lastPhysical) {
      this.lastPhysical = nowPhysical
      this.lastLogical = 0
    }
    else {
      // Physical clock stalled or went backwards — bump the logical counter
      // to preserve a strict ordering between successive calls.
      this.lastLogical += 1
    }
    return { physical: this.lastPhysical, logical: this.lastLogical, nodeId: this.nodeId }
  }

  /**
   * Absorb a remote timestamp. Updates the clock so subsequent `now()` calls
   * are strictly greater than both the local clock and the remote one.
   *
   * Rejects remote timestamps whose physical component exceeds
   * `physicalNow()` by more than `maxClockSkewMs` — without this check, a
   * single misconfigured or malicious peer could permanently advance the
   * clock by an arbitrary amount and break causal ordering across every
   * other node in the system. Past timestamps are always safe to absorb,
   * so the check is one-sided.
   *
   * Also rejects non-finite physical values (NaN / Infinity) before any
   * arithmetic — `Math.max(x, NaN) === NaN` would otherwise poison the
   * clock and `NaN > maxClockSkewMs` would silently bypass the skew gate.
   *
   * @throws {HLCClockSkewError} when the remote is too far in the future
   *   or has a non-finite physical timestamp.
   */
  receive(remote: HLCTimestamp): HLCTimestamp {
    const nowPhysical = this.physicalNow()

    if (!Number.isFinite(remote.physical)) {
      const info: HLCClockSkewInfo = {
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
      const info: HLCClockSkewInfo = {
        remote,
        localPhysical: nowPhysical,
        skewMs,
        maxClockSkewMs: this.maxClockSkewMs,
      }
      this.onClockSkew?.(info)
      // Bail before mutating any state so a rejected remote leaves the
      // clock untouched and a retry with a saner timestamp still works.
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
 * Factory that creates a fresh {@link HybridLogicalClock}.
 * Prefer this over `new HybridLogicalClock` for call-site brevity.
 */
export function createHLCClock(nodeId?: string): HybridLogicalClock {
  return new HybridLogicalClock({ nodeId })
}

let defaultClock: HybridLogicalClock | null = null

/** Get (and lazily create) the process-wide default clock. */
export function getDefaultClock(): HybridLogicalClock {
  defaultClock ??= new HybridLogicalClock()
  return defaultClock
}

/** Override the process-wide default clock. Primarily useful in tests. */
export function setDefaultClock(clock: HybridLogicalClock): void {
  defaultClock = clock
}

/** Serialize an {@link HLCTimestamp} to a lexicographically-orderable string. */
export function stringifyHLC(ts: HLCTimestamp): HLCString {
  const physical = ts.physical.toString(16).padStart(PHYSICAL_DIGITS, '0')
  const logical = ts.logical.toString(16).padStart(LOGICAL_DIGITS, '0')
  return `${physical}:${logical}:${ts.nodeId}`
}

/** Parse a serialized HLC string back into an {@link HLCTimestamp}. */
export function parseHLC(str: HLCString): HLCTimestamp {
  // Split on the first two colons only — nodeId may legitimately contain colons.
  const firstColon = str.indexOf(':')
  const secondColon = str.indexOf(':', firstColon + 1)
  if (firstColon < 0 || secondColon < 0) {
    throw new Error(`Invalid HLC string: ${str}`)
  }
  const physical = Number.parseInt(str.slice(0, firstColon), 16)
  const logical = Number.parseInt(str.slice(firstColon + 1, secondColon), 16)
  const nodeId = str.slice(secondColon + 1)
  return { physical, logical, nodeId }
}

/**
 * Coerce an arbitrary {@link FieldTimestampValue} into a normalized
 * `{physical, logical, nodeId}` shape for comparison purposes.
 *
 * - Numbers are legacy wall-clock timestamps — they become
 *   `{physical: n, logical: 0, nodeId: ''}` so they order correctly against
 *   HLC values with the same physical time (HLC wins on nodeId tiebreak since
 *   empty string sorts first).
 */
function coerceHLC(value: FieldTimestampValue): HLCTimestamp {
  if (typeof value === 'number') {
    return { physical: value, logical: 0, nodeId: '' }
  }
  return parseHLC(value)
}

/**
 * Compare two timestamps. Returns a negative number if `a` < `b`, zero if
 * equal, positive if `a` > `b`. Accepts both {@link HLCTimestamp} objects,
 * serialized strings, and legacy numeric timestamps.
 */
export function compareHLC(a: FieldTimestampValue | HLCTimestamp, b: FieldTimestampValue | HLCTimestamp): number {
  const left = typeof a === 'object' ? a : coerceHLC(a)
  const right = typeof b === 'object' ? b : coerceHLC(b)
  if (left.physical !== right.physical) {
    return left.physical - right.physical
  }
  if (left.logical !== right.logical) {
    return left.logical - right.logical
  }
  if (left.nodeId < right.nodeId)
    return -1
  if (left.nodeId > right.nodeId)
    return 1
  return 0
}
