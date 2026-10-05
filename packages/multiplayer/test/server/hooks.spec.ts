import { createMultiplayerServerHooks } from '@rstore/multiplayer/server'
import { describe, expect, it } from 'vitest'

describe('createMultiplayerServerHooks', () => {
  it('awaits handlers in registration order and forgets unregistered ones', async () => {
    const hooks = createMultiplayerServerHooks()
    const calls: string[] = []
    hooks.hook('multiplayer.filter', async () => {
      await Promise.resolve()
      calls.push('first')
    })
    const unregister = hooks.hook('multiplayer.filter', () => {
      calls.push('second')
    })

    await hooks.callHook('multiplayer.filter', {} as any)
    unregister()
    await hooks.callHook('multiplayer.filter', {} as any)

    expect(calls).toEqual(['first', 'second', 'first'])
  })

  it('reports whether a hook has handlers', () => {
    const hooks = createMultiplayerServerHooks()
    expect(hooks.hasHook('multiplayer.authorize')).toBe(false)

    const unregister = hooks.hook('multiplayer.authorize', () => {})
    expect(hooks.hasHook('multiplayer.authorize')).toBe(true)

    unregister()
    expect(hooks.hasHook('multiplayer.authorize')).toBe(false)
  })
})
