import { withInjectionContext, withScope } from '#test-utils/store/vueApp'
import { createVueStack } from '#test-utils/store/vueStack'
import { stubWindow } from '#test-utils/store/windowStub'
import { describe, expect, it, vi } from 'vitest'
import { useStore } from '../../../src'
import { harnessSchema } from './shared'

describe('vue context and scope helpers', () => {
  it('resolves useStore from injection context', async () => {
    const { store } = await createVueStack({ schema: harnessSchema, remote: false })
    expect(withInjectionContext(store, () => useStore()).result).toBe(store)
    expect(() => withInjectionContext(null, () => useStore())).toThrow(/not installed/)
  })

  it('releases a live query when its scope stops', async () => {
    const { store, remote, scope } = await createVueStack({ schema: harnessSchema, data: { todos: [] } })
    const { result, stop } = scope(() => store.todos.liveQuery((q: any) => q.many()))
    await result
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(1))
    stop()
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(0))
  })

  it('provides an addressable window and localStorage', () => {
    const stub = stubWindow()
    try {
      let focused = 0
      window.addEventListener('focus', () => focused++)
      stub.dispatch('focus')
      expect(focused).toBe(1)
      window.localStorage.setItem('k', 'v')
      expect(stub.storage.get('k')).toBe('v')
    }
    finally {
      stub.restore()
    }
  })

  it('opens and stops a scope outside a stack', () => {
    const { result, stop } = withScope(() => 'value')
    expect(result).toBe('value')
    stop()
  })
})
