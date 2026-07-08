import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { createFormObject } from '../src'

/** Supported Temporal object tags used by the dirty-tracking regression tests. */
type TemporalTestTag = 'Temporal.PlainDateTime' | 'Temporal.ZonedDateTime'

/**
 * Test double for Temporal objects whose state is stored outside enumerable keys.
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
 * Create a PlainDateTime-shaped form field value.
 */
function createPlainDateTime(value: string) {
  return new TemporalTestValue('Temporal.PlainDateTime', value)
}

/**
 * Create a ZonedDateTime-shaped form field value.
 */
function createZonedDateTime(value: string) {
  return new TemporalTestValue('Temporal.ZonedDateTime', value)
}

/**
 * Create a form with a populated or empty Temporal-like field.
 */
function createTemporalForm(publishedAt: TemporalTestValue | null) {
  return createFormObject({
    defaultValues: () => ({ publishedAt }),
    submit: async () => undefined,
    validateOnSubmit: false,
  })
}

describe('createFormObject - Temporal dirty tracking', () => {
  it('marks a populated PlainDateTime-like field dirty when edited', async () => {
    const initialValue = createPlainDateTime('2026-07-07T22:25')
    const nextValue = createPlainDateTime('2026-07-07T22:30')
    const form = createTemporalForm(initialValue)

    expect(form.$hasChanges()).toBe(false)

    form.publishedAt = nextValue
    await nextTick()

    expect(form.$hasChanges()).toBe(true)
    expect(form.$changedProps.publishedAt?.[0]).toBe(nextValue)
    expect(form.$changedProps.publishedAt?.[1]).toBe(initialValue)
  })

  it('keeps a populated PlainDateTime-like field clean when the value is unchanged', async () => {
    const initialValue = createPlainDateTime('2026-07-07T22:25')
    const equalValue = createPlainDateTime('2026-07-07T22:25')
    const form = createTemporalForm(initialValue)

    form.publishedAt = equalValue
    await nextTick()

    expect(form.$hasChanges()).toBe(false)
    expect(form.$changedProps).toEqual({})
  })

  it('marks a populated ZonedDateTime-like field dirty when edited', async () => {
    const initialValue = createZonedDateTime('2026-07-07T22:25+02:00[Europe/Paris]')
    const nextValue = createZonedDateTime('2026-07-07T22:30+02:00[Europe/Paris]')
    const form = createTemporalForm(initialValue)

    form.publishedAt = nextValue
    await nextTick()

    expect(form.$hasChanges()).toBe(true)
    expect(form.$changedProps.publishedAt?.[0]).toBe(nextValue)
    expect(form.$changedProps.publishedAt?.[1]).toBe(initialValue)
  })

  it('keeps null transitions dirty', async () => {
    const plainValue = createPlainDateTime('2026-07-07T22:25')
    const emptyForm = createTemporalForm(null)

    emptyForm.publishedAt = plainValue
    await nextTick()

    expect(emptyForm.$hasChanges()).toBe(true)
    expect(emptyForm.$changedProps.publishedAt?.[0]).toBe(plainValue)
    expect(emptyForm.$changedProps.publishedAt?.[1]).toBeNull()

    const populatedForm = createTemporalForm(plainValue)

    populatedForm.publishedAt = null
    await nextTick()

    expect(populatedForm.$hasChanges()).toBe(true)
    expect(populatedForm.$changedProps.publishedAt?.[0]).toBeNull()
    expect(populatedForm.$changedProps.publishedAt?.[1]).toBe(plainValue)
  })
})
