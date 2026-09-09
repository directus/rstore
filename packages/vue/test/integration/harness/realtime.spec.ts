import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { harnessSchema, harnessTodos } from './shared'

/** Opens a live `todos` query for each fake-remote realtime test. */
async function setup(options: Record<string, any> = {}) {
  const stack = await createVueStack({ schema: harnessSchema, data: harnessTodos(), ...options })
  const list = await stack.run(() => stack.store.todos.liveQuery((q: any) => q.many()))
  await vi.waitFor(() => expect(stack.remote.subscriptions()).toHaveLength(1))
  return { ...stack, list }
}

/** Finds one visible row title from a live list. */
function title(list: any, id: string) {
  return list.data.value.find((todo: any) => todo.id === id)?.title
}

describe('fake remote realtime frames', () => {
  it('drops an older field frame', async () => {
    const { remote, list } = await setup()
    remote.emit({ type: 'updated', collection: 'todos', item: { id: '1', title: 'Newer' }, fieldTimestamps: { title: 200 } })
    await nextTick()
    remote.emit({ type: 'updated', collection: 'todos', item: { id: '1', title: 'Stale' }, fieldTimestamps: { title: 100 } })
    await nextTick()
    expect(title(list, '1')).toBe('Newer')
  })

  it('suppresses stale writes after a tombstone', async () => {
    const { store, remote, list } = await setup()
    remote.emit({ type: 'deleted', collection: 'todos', key: '2', deletedAt: 300 })
    await nextTick()
    expect(store.$cache.tombstones.size()).toBe(1)
    remote.emit({ type: 'updated', collection: 'todos', item: { id: '2', title: 'Zombie' }, fieldTimestamps: { title: 100 } })
    await nextTick()
    expect(title(list, '2')).toBeUndefined()
    remote.emit({ type: 'updated', collection: 'todos', item: { id: '2', title: 'Back' }, fieldTimestamps: { title: 400 } })
    await nextTick()
    expect(title(list, '2')).toBe('Back')
  })

  it('drops a local echo frame', async () => {
    const { remote, list } = await setup({ remote: { clientId: 'me' } })
    remote.emit({ type: 'updated', collection: 'todos', item: { id: '1', title: 'Echo' }, clientId: 'me' })
    await nextTick()
    expect(title(list, '1')).toBe('One')
    remote.emit({ type: 'updated', collection: 'todos', item: { id: '1', title: 'Other' }, clientId: 'someone-else' })
    await nextTick()
    expect(title(list, '1')).toBe('Other')
  })
})
