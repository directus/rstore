import { createHookable } from '@rstore/shared'
import { describe, expectTypeOf, it } from 'vitest'

/**
 * `callHook` awaits every callback, so the promise it returns carries the
 * awaited callback result — never the callback's own promise. `callHookSync`
 * does not await, and keeps that promise as the value it returns.
 */

interface ReturnHooks {
  /** Async callback: the dispatch resolves with the fulfilled value. */
  asyncValue: () => Promise<number>
  /** Async callback whose fulfilled value may be `null`. */
  asyncNullable: () => Promise<number | null>
  /** Synchronous callback, still dispatched asynchronously by `callHook`. */
  syncValue: () => string
  /** Payload carrying a callback, whose parameter must stay contextually typed. */
  withPayload: (payload: { setResult: (result: number) => void }) => void
}

const hooks = createHookable<ReturnHooks>()

describe('callHook return type', () => {
  it('resolves with the awaited callback result', () => {
    const promised: Promise<number | undefined> = hooks.callHook('asyncValue')

    expectTypeOf(promised).toEqualTypeOf<Promise<number | undefined>>()
    expectTypeOf(hooks.callHook('asyncValue')).toEqualTypeOf<Promise<number | undefined>>()
  })

  it('types a then consumer with the awaited result', () => {
    const consumed = hooks.callHook('asyncValue').then((value) => {
      expectTypeOf(value).toEqualTypeOf<number | undefined>()
      return value?.toFixed()
    })

    expectTypeOf(consumed).toEqualTypeOf<Promise<string | undefined>>()
  })

  it('keeps a nullable async result nullable', () => {
    expectTypeOf(hooks.callHook('asyncNullable')).toEqualTypeOf<Promise<number | null | undefined>>()
  })

  it('wraps a synchronous callback result in the dispatch promise', () => {
    expectTypeOf(hooks.callHook('syncValue')).toEqualTypeOf<Promise<string | undefined>>()
  })

  it('resolves the same value when a trailing abort handle is passed', () => {
    const abort = hooks.withAbort({ explicit: true })

    expectTypeOf(hooks.callHook('asyncValue', abort)).toEqualTypeOf<Promise<number | undefined>>()
  })

  it('keeps the payload callbacks contextually typed', () => {
    void hooks.callHook('withPayload', {
      setResult: (result) => {
        expectTypeOf(result).toEqualTypeOf<number>()
      },
    })
  })
})

describe('callHookSync return type', () => {
  it('returns an async callback result unawaited', () => {
    // The synchronous dispatch never awaits, so the promise itself is the
    // value the caller receives.
    expectTypeOf(hooks.callHookSync('asyncValue')).toEqualTypeOf<Promise<number> | undefined>()
  })

  it('returns a synchronous callback result directly', () => {
    expectTypeOf(hooks.callHookSync('syncValue')).toEqualTypeOf<string | undefined>()
  })
})
