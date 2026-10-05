/**
 * Temporal-like test doubles shared by the equality suites (`fieldValuesEqual`
 * in Shared, `diffFields` in Core).
 */

/** Supported Temporal object tags used by the equality regression tests. */
type TemporalTestTag = 'Temporal.PlainDateTime' | 'Temporal.ZonedDateTime'

/**
 * Test double for Temporal objects whose data lives outside enumerable keys.
 */
class TemporalTestValue {
  /** Temporal brand exposed through `Symbol.toStringTag`. */
  readonly #tag: TemporalTestTag
  /** Serialized value compared by `equals()`. */
  readonly #value: string

  /**
   * Create a Temporal-like test value.
   */
  constructor(tag: TemporalTestTag, value: string) {
    this.#tag = tag
    this.#value = value
  }

  /**
   * Return the branded object tag used by native and polyfilled Temporal values.
   */
  get [Symbol.toStringTag]() {
    return this.#tag
  }

  /**
   * Compare values through the same public protocol exposed by Temporal.
   */
  equals(other: unknown) {
    return other instanceof TemporalTestValue
      && other.#tag === this.#tag
      && other.#value === this.#value
  }
}

/**
 * Create a PlainDateTime-shaped test value.
 */
export function createPlainDateTime(value: string) {
  return new TemporalTestValue('Temporal.PlainDateTime', value)
}

/**
 * Create a ZonedDateTime-shaped test value.
 */
export function createZonedDateTime(value: string) {
  return new TemporalTestValue('Temporal.ZonedDateTime', value)
}
