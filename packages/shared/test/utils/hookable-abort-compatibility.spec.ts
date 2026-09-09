import { createHookable } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'

/** A payload that is a callback carrying its own signal — a valid hook argument. */
type SignalCarryingCallback = (() => void) & { signal: AbortSignal }

describe('implicit abort compatibility', () => {
  it.each(['before', 'during'] as const)('aborts the next dispatch when called %s callbacks', async (when) => {
    const hooks = createHookable<{ event: (value: string) => string }>()
    const calls: string[] = []
    const abort = hooks.withAbort()
    hooks.hook('event', (value) => {
      calls.push(value)
      abort()
      return 'first'
    })
    hooks.hook('event', () => {
      calls.push('second')
      return 'second'
    })
    if (when === 'before') {
      abort()
    }

    expect(await hooks.callHook('event', 'payload')).toBe(when === 'before' ? undefined : 'first')
    expect(calls).toEqual(when === 'before' ? [] : ['payload'])
    // The implicit handle applies once, even when the callback aborts again.
    expect(await hooks.callHook('event', 'next')).toBe('second')
    expect(calls.slice(-2)).toEqual(['next', 'second'])
  })

  it('consumes the implicit handle before nested dispatch begins', async () => {
    const hooks = createHookable<{ outer: () => string | Promise<string>, inner: () => string }>()
    const abort = hooks.withAbort()
    const calls: string[] = []
    hooks.hook('inner', () => {
      calls.push('inner')
      return 'nested'
    })
    hooks.hook('outer', async () => {
      abort()
      return await hooks.callHook('inner') ?? 'missing'
    })
    hooks.hook('outer', () => {
      calls.push('late outer')
      return 'unexpected'
    })

    expect(await hooks.callHook('outer')).toBe('nested')
    expect(calls).toEqual(['inner'])
  })

  it('keeps an explicit aborted handle from affecting an unrelated dispatch', async () => {
    const hooks = createHookable<{ event: () => string }>()
    hooks.hook('event', () => 'value')
    const abort = hooks.withAbort({ explicit: true })
    abort()

    expect(await hooks.callHook('event')).toBe('value')
    expect(await hooks.callHook('event', abort)).toBeUndefined()
    expect(await hooks.callHook('event')).toBe('value')
  })
})

describe('abort handle recognition', () => {
  it('passes a trailing callback carrying an aborted signal to the callbacks', async () => {
    const hooks = createHookable<{ event: (listener: SignalCarryingCallback) => string }>()
    const received: unknown[] = []
    hooks.hook('event', (listener) => {
      received.push(listener)
      return 'ran'
    })
    const controller = new AbortController()
    const listener: SignalCarryingCallback = Object.assign(() => {}, { signal: controller.signal })
    // Only a handle from `withAbort` is dispatch metadata: an unrelated aborted
    // signal on a payload must neither be stripped nor stop the dispatch.
    controller.abort()

    expect(await hooks.callHook('event', listener)).toBe('ran')
    expect(received).toEqual([listener])
  })

  it('does not read the signal of an ordinary trailing argument', async () => {
    let signalReads = 0
    const controller = new AbortController()
    // A getter is the observable form of the question: recognition must not
    // touch the payload at all, since reading it can have side effects.
    const payload = Object.defineProperty(() => {}, 'signal', {
      get() {
        signalReads++
        return controller.signal
      },
    }) as SignalCarryingCallback
    const hooks = createHookable<{ event: (listener: SignalCarryingCallback) => void }>()
    const callback = vi.fn()
    hooks.hook('event', callback)

    await hooks.callHook('event', payload)

    expect(signalReads).toBe(0)
    expect(callback).toHaveBeenCalledWith(payload)
  })

  it('still consumes a real handle passed after a handle-shaped payload', async () => {
    const hooks = createHookable<{ event: (listener: SignalCarryingCallback) => string }>()
    const received: unknown[] = []
    const abort = hooks.withAbort({ explicit: true })
    hooks.hook('event', (listener) => {
      received.push(listener)
      abort()
      return 'first'
    })
    const second = vi.fn(() => 'second')
    hooks.hook('event', second)
    const listener: SignalCarryingCallback = Object.assign(() => {}, { signal: new AbortController().signal })

    expect(await hooks.callHook('event', listener, abort)).toBe('first')
    // The handle is still stripped; the handle-shaped argument before it is not.
    expect(received).toEqual([listener])
    expect(second).not.toHaveBeenCalled()
  })

  it('leaves the legacy implicit handle in charge of a handle-shaped dispatch', async () => {
    const hooks = createHookable<{ event: (listener: SignalCarryingCallback) => string }>()
    const calls: unknown[] = []
    const abort = hooks.withAbort()
    hooks.hook('event', (listener) => {
      calls.push(listener)
      abort()
      return 'first'
    })
    hooks.hook('event', () => {
      calls.push('second')
      return 'second'
    })
    const listener: SignalCarryingCallback = Object.assign(() => {}, { signal: new AbortController().signal })

    expect(await hooks.callHook('event', listener)).toBe('first')
    expect(calls).toEqual([listener])
  })
})
