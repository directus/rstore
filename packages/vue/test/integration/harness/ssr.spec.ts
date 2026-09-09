import { createCoreStack } from '#test-utils/store/coreStack'
import { hydrate, serializeCacheState } from '#test-utils/store/ssr'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'
import { harnessSchema } from './shared'

describe('harness real cache and SSR boundary', () => {
  it('reads through the real core cache', async () => {
    const stack = await createCoreStack({ schema: harnessSchema, data: { todos: [{ id: '1', title: 'One' }] } })
    await stack.store.$cache.writeItem({ collection: stack.collection('todos'), key: '1', item: { id: '1', title: 'One' } })
    const item = stack.read('todos', '1')!
    expect(item.$getKey()).toBe('1')
    expect(item.title).toBe('One')
  })

  it('hydrates a fresh Vue store from detached state', async () => {
    const server = await createVueStack({ schema: harnessSchema, data: { todos: [{ id: '1', title: 'One' }] }, isServer: true })
    await server.store.todos.findMany()
    const payload = serializeCacheState(server.store.$cache.getState())
    const client = await createVueStack({ schema: harnessSchema, remote: server.remote })
    hydrate(client.store.$cache, payload)
    expect(client.read('todos', '1')!.title).toBe('One')
    const cloned = payload.collections.todos?.['1']
    expect(cloned).toEqual({ id: '1', title: 'One' })
    expect(cloned).not.toBe(server.store.$cache.getState().collections.todos?.['1'])
  })
})
