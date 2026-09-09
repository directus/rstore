import { describe, expect, it } from 'vitest'
import { createHookable } from '../../src'

describe('hookable callHookWith', () => {
  it('should hand the caller a copy of the callback list', async () => {
    const hooks = createHookable<{ test: () => string }>()
    const calls: string[] = []
    hooks.hook('test', () => {
      calls.push('first')
      return 'first'
    })
    hooks.hook('test', () => {
      calls.push('second')
      return 'second'
    })

    const received = hooks.callHookWith('test', (callbacks) => {
      callbacks.splice(0, callbacks.length)
      return callbacks
    })

    expect(received).toHaveLength(0)
    // Mutating the inspection list must leave later dispatch usable and ordered.
    expect(await hooks.callHook('test')).toBe('second')
    expect(calls).toEqual(['first', 'second'])
  })

  it('should call the caller with an empty list for an unregistered hook', () => {
    const hooks = createHookable<{ test: () => string }>()

    let received: unknown
    const result = hooks.callHookWith('test', (callbacks) => {
      received = callbacks
      return callbacks.length
    })

    expect(result).toBe(0)
    expect(received).toEqual([])
  })

  it('should expose the registered callbacks in registration order', async () => {
    const hooks = createHookable<{ test: (arg: string) => string }>()
    hooks.hook('test', arg => `a:${arg}`)
    hooks.hook('test', arg => `b:${arg}`)

    const results = await hooks.callHookWith('test', async (callbacks) => {
      const output: string[] = []
      for (const { callback } of callbacks) {
        output.push(await callback('x'))
      }
      return output
    })

    expect(results).toEqual(['a:x', 'b:x'])
  })
})

describe('hookable plugin metadata', () => {
  it('should keep the plugin a callback was registered with', () => {
    const hooks = createHookable<{ test: () => void }>()
    const plugin = { name: 'my-plugin', scopeId: 'scope-a', setup: () => {} }
    hooks.hook('test', () => {}, plugin)
    hooks.hook('test', () => {})

    const plugins = hooks.callHookWith('test', callbacks => callbacks.map(cb => (cb as any).plugin))

    // Registration-time metadata is the only way a consumer can tell which
    // plugin owns a callback (scope filtering, devtools).
    expect(plugins).toEqual([plugin, undefined])
  })
})
