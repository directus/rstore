import { describe, expect, it, vi } from 'vitest'
import { createHooks } from '../../src/utils/hookable.js'

describe('hookable', () => {
  it('should register and call a hook', async () => {
    const hooks = createHooks<{ test: (arg: string) => string }>()
    const callback = (arg: string) => `Hello, ${arg}`
    hooks.hook('test', callback)

    const result = await hooks.callHook('test', 'world')
    expect(result).toBe('Hello, world')
  })

  it('should register and call multiple hooks', async () => {
    const hooks = createHooks<{ test: (arg: string) => string }>()
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
    const hooks = createHooks<{ test: (arg: string) => string }>()
    const callback = (arg: string) => `Hello, ${arg}`
    const removeHook = hooks.hook('test', callback)

    removeHook()
    const result = await hooks.callHook('test', 'world')
    expect(result).toBeUndefined()
  })

  it('should call hooks synchronously', () => {
    const hooks = createHooks<{ test: (arg: string) => string }>()
    const callback = (arg: string) => `Hello, ${arg}`
    hooks.hook('test', callback)

    const result = hooks.callHookSync('test', 'world')
    expect(result).toBe('Hello, world')
  })

  it('should handle hooks with no return value', async () => {
    const hooks = createHooks<{ test: (arg: string) => void }>()
    const callback = (_arg: string) => { /* no return */ }
    hooks.hook('test', callback)

    const result = await hooks.callHook('test', 'world')
    expect(result).toBeUndefined()
  })
})
