import { describe, expect, it, vi } from 'vitest'
import { createHookable } from '../../src'

describe('hookable', () => {
  it('should register and call a hook', async () => {
    const hooks = createHookable<{ test: (arg: string) => string }>()
    const callback = (arg: string) => `Hello, ${arg}`
    hooks.hook('test', callback)

    const result = await hooks.callHook('test', 'world')
    expect(result).toBe('Hello, world')
  })

  it('should register and call multiple hooks', async () => {
    const hooks = createHookable<{ test: (arg: string) => string }>()
    const callback1 = vi.fn((arg: string) => `Hello, ${arg}`)
    const callback2 = vi.fn((arg: string) => `Hi, ${arg}`)
    hooks.hook('test', callback1)
    hooks.hook('test', callback2)

    const result = await hooks.callHook('test', 'world')
    expect(result).toBe('Hi, world')
    expect(callback1).toHaveBeenCalled()
    expect(callback2).toHaveBeenCalled()
  })

  it('should remove a hook', async () => {
    const hooks = createHookable<{ test: (arg: string) => string }>()
    const callback = (arg: string) => `Hello, ${arg}`
    const removeHook = hooks.hook('test', callback)

    removeHook()
    const result = await hooks.callHook('test', 'world')
    expect(result).toBeUndefined()
  })

  it('should call hooks synchronously', () => {
    const hooks = createHookable<{ test: (arg: string) => string }>()
    const callback = (arg: string) => `Hello, ${arg}`
    hooks.hook('test', callback)

    const result = hooks.callHookSync('test', 'world')
    expect(result).toBe('Hello, world')
  })

  it('should handle hooks with no return value', async () => {
    const hooks = createHookable<{ test: (arg: string) => void }>()
    const callback = (_arg: string) => { /* no return */ }
    hooks.hook('test', callback)

    const result = await hooks.callHook('test', 'world')
    expect(result).toBeUndefined()
  })
})

describe('hookable return semantics', () => {
  it('should keep the last non-nullish result instead of the last one', async () => {
    const hooks = createHookable<{ test: () => string | null | undefined }>()
    hooks.hook('test', () => 'first')
    hooks.hook('test', () => null)
    hooks.hook('test', () => undefined)

    // A plugin that returns nothing must not erase the result of a plugin that
    // ran before it: `callHook` only overwrites on a non-nullish value.
    expect(await hooks.callHook('test')).toBe('first')
  })

  it('should treat false and 0 as results', async () => {
    const falsy = createHookable<{ test: () => boolean }>()
    falsy.hook('test', () => true)
    falsy.hook('test', () => false)
    expect(await falsy.callHook('test')).toBe(false)

    const zero = createHookable<{ test: () => number }>()
    zero.hook('test', () => 42)
    zero.hook('test', () => 0)
    expect(await zero.callHook('test')).toBe(0)
  })

  it('should resolve with the awaited value of an async callback', async () => {
    const hooks = createHookable<{ test: () => Promise<number> }>()
    hooks.hook('test', async () => 42)

    const observed: unknown[] = []
    await hooks.callHook('test').then(value => observed.push(value))

    // The dispatch awaits the callback, so consumers receive the scalar and
    // never the callback's own promise — as the public type now states.
    expect(observed).toEqual([42])
  })

  it('should keep the same semantics in callHookSync', () => {
    const hooks = createHookable<{ test: () => string | number | null }>()
    hooks.hook('test', () => 'first')
    hooks.hook('test', () => null)
    hooks.hook('test', () => 0)

    expect(hooks.callHookSync('test')).toBe(0)
  })
})

describe('hookable dispatch order', () => {
  it('should await each async callback before starting the next one', async () => {
    const hooks = createHookable<{ test: () => Promise<void> }>()
    const log: string[] = []

    for (const name of ['a', 'b', 'c']) {
      hooks.hook('test', async () => {
        log.push(`${name}:start`)
        await new Promise(resolve => setTimeout(resolve, 5))
        log.push(`${name}:end`)
      })
    }

    await hooks.callHook('test')

    // Concurrent dispatch would interleave the starts; the batch scheduler and
    // `core/src/sync.ts` both rely on strict sequencing.
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end'])
  })

  it('should still run a callback removed by an earlier callback of the same dispatch', async () => {
    const hooks = createHookable<{ test: () => void }>()
    const called: string[] = []
    let removeSecond: () => void
    hooks.hook('test', () => {
      called.push('first')
      removeSecond()
    })
    removeSecond = hooks.hook('test', () => {
      called.push('second')
    })

    await hooks.callHook('test')

    // `hook()`'s disposer replaces `_hooks[name]` with a filtered copy while the
    // dispatch iterates the previous array, so the removal only applies to the
    // next dispatch.
    expect(called).toEqual(['first', 'second'])
    expect(await hooks.callHook('test')).toBeUndefined()
    expect(called).toEqual(['first', 'second', 'first'])
  })
})

describe('hookable error propagation', () => {
  it('should reject with the original error, stop the chain and stay usable', async () => {
    const hooks = createHookable<{ test: () => string }>()
    const error = new Error('hook failed')
    const after = vi.fn(() => 'after')
    const removeFailing = hooks.hook('test', () => {
      throw error
    })
    hooks.hook('test', after)

    await expect(hooks.callHook('test')).rejects.toBe(error)
    expect(after).not.toHaveBeenCalled()

    // The failed dispatch must not leave the hookable in a broken state.
    removeFailing()
    expect(await hooks.callHook('test')).toBe('after')
  })

  it('should throw synchronously from callHookSync', () => {
    const hooks = createHookable<{ test: () => string }>()
    const after = vi.fn(() => 'after')
    hooks.hook('test', () => {
      throw new Error('sync hook failed')
    })
    hooks.hook('test', after)

    expect(() => hooks.callHookSync('test')).toThrowError(/sync hook failed/)
    expect(after).not.toHaveBeenCalled()
  })

  it('should return an async callback result as a promise from callHookSync', async () => {
    const hooks = createHookable<{ test: () => any }>()
    hooks.hook('test', async () => {
      throw new Error('rejected in sync dispatch')
    })

    // Footgun pinned on purpose: `callHookSync` does not await, so an async
    // callback's rejection is returned as a value instead of being thrown.
    const result = hooks.callHookSync('test')
    expect(result).toBeInstanceOf(Promise)
    await expect(result).rejects.toThrowError(/rejected in sync dispatch/)
  })
})

describe('hookable withAbort', () => {
  it('should stop the remaining callbacks and resolve with the last result before the abort', async () => {
    const hooks = createHookable<{ test: () => string }>()
    const second = vi.fn(() => 'second')
    const third = vi.fn(() => 'third')
    const abort = hooks.withAbort({ explicit: true })
    hooks.hook('test', () => {
      abort()
      return 'first'
    })
    hooks.hook('test', second)
    hooks.hook('test', third)

    expect(await hooks.callHook('test', abort)).toBe('first')
    expect(second).not.toHaveBeenCalled()
    expect(third).not.toHaveBeenCalled()
  })

  it('should abort before the first callback when aborted before the dispatch', async () => {
    const hooks = createHookable<{ test: () => string }>()
    const callback = vi.fn(() => 'value')
    hooks.hook('test', callback)

    const abort = hooks.withAbort({ explicit: true })
    abort()

    expect(await hooks.callHook('test', abort)).toBeUndefined()
    expect(callback).not.toHaveBeenCalled()
  })

  it('should only apply to the dispatch it is passed to', async () => {
    const hooks = createHookable<{ test: () => string }>()
    const callback = vi.fn(() => 'value')
    hooks.hook('test', callback)

    const abort = hooks.withAbort({ explicit: true })
    abort()

    await hooks.callHook('test', abort)
    // A dispatch that was not handed the handle runs normally.
    expect(await hooks.callHook('test')).toBe('value')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should not pass the abort handle to the callbacks', async () => {
    const hooks = createHookable<{ test: (payload: { value: number }) => void }>()
    const callback = vi.fn()
    hooks.hook('test', callback)

    const abort = hooks.withAbort({ explicit: true })
    await hooks.callHook('test', { value: 1 }, abort)

    // The handle is dispatch metadata, not an argument the hook sees.
    expect(callback).toHaveBeenCalledWith({ value: 1 })
  })

  it('should abort the hook it was created for, not whichever dispatch runs first', async () => {
    const hooks = createHookable<{ inner: () => void, outer: () => string }>()
    const ran: string[] = []
    hooks.hook('inner', () => {
      ran.push('inner')
    })
    hooks.hook('outer', () => {
      ran.push('outer-1')
      return 'one'
    })
    hooks.hook('outer', () => {
      ran.push('outer-2')
      return 'two'
    })

    const abort = hooks.withAbort({ explicit: true })
    // An unrelated dispatch — e.g. a hook fired re-entrantly by a callback —
    // runs in between. It used to burn the pending signal, because the signal
    // was stashed on the instance rather than bound to a dispatch.
    await hooks.callHook('inner')
    abort()

    const result = await hooks.callHook('outer', abort)

    expect(ran).toEqual(['inner'])
    expect(result).toBeUndefined()
  })
})
