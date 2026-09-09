import type { FakeRemote } from '#test-utils/store/fakeRemote'
import type { StoreSchema } from '@rstore/shared'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// Real connectors deliver realtime frames through
// `store.$cache.writeItem({ ..., fieldTimestamps })` and
// `store.$cache.deleteItem({ ..., deletedAt })`
// (`packages/nuxt-drizzle/src/runtime/plugin-realtime.ts:137`). That contract
// carries the field-level LWW merge, the tombstones and the echo suppression,
// and until the harness used it those were only reachable from the connector
// suites. Everything here is asserted through `query.data` of a live query,
// because the point of the contract is that the view ends up correct.

const schema: StoreSchema = [{ name: 'todos' }]

/** Store with a live list query already subscribed to `todos`. */
async function setup(clientId?: string) {
  const { store, run, remote } = await createVueStack({
    schema,
    remote: { clientId },
    data: {
      todos: [
        { id: '1', title: 'One', done: false },
        { id: '2', title: 'Two', done: false },
      ],
    },
  })
  const list = await run(() => (store as any).todos.liveQuery((q: any) => q.many()))
  await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(1))
  return { store: store as any, remote, list }
}

/** Ids currently visible in the live query. */
function ids(list: any) {
  return list.data.value.map((todo: any) => todo.id)
}

/** The live query's view of one todo. */
function todo(list: any, id: string) {
  return list.data.value.find((item: any) => item.id === id)
}

/** Emits a frame and lets the cache write reach the query. */
async function emit(remote: FakeRemote, frame: Parameters<FakeRemote['emit']>[0]) {
  remote.emit(frame)
  await nextTick()
}

describe('realtime connector contract', () => {
  it('merges a stamped frame field by field and ignores an older stamp', async () => {
    const { remote, list } = await setup()

    await emit(remote, {
      type: 'updated',
      collection: 'todos',
      item: { id: '1', title: 'From server', done: true },
      fieldTimestamps: { title: 2000, done: 2000 },
    })
    expect(todo(list, '1').title).toBe('From server')

    // Stale frame: the local value was written by a newer stamp, so it wins.
    await emit(remote, {
      type: 'updated',
      collection: 'todos',
      item: { id: '1', title: 'Stale' },
      fieldTimestamps: { title: 1000 },
    })
    expect(todo(list, '1').title).toBe('From server')

    // Newer stamp on one field only: that field changes, the other is kept.
    await emit(remote, {
      type: 'updated',
      collection: 'todos',
      item: { id: '1', title: 'Newer' },
      fieldTimestamps: { title: 3000 },
    })
    expect(todo(list, '1').title).toBe('Newer')
    expect(todo(list, '1').done).toBe(true)
  })

  it('suppresses a frame stamped before the delete it follows', async () => {
    const { store, remote, list } = await setup()

    await emit(remote, { type: 'deleted', collection: 'todos', key: '2', deletedAt: 2000 })
    expect(ids(list)).toEqual(['1'])
    expect(store.$cache.tombstones.get('todos', '2')).toMatchObject({ deletedAt: 2000 })

    // A create/update that the server sent before the delete must not bring
    // the row back, however late it arrives.
    await emit(remote, {
      type: 'updated',
      collection: 'todos',
      item: { id: '2', title: 'Late' },
      fieldTimestamps: { title: 1000 },
    })
    expect(ids(list)).toEqual(['1'])
  })

  it('resurrects a deleted item from a frame stamped after the delete', async () => {
    const { store, remote, list } = await setup()
    await emit(remote, { type: 'deleted', collection: 'todos', key: '2', deletedAt: 2000 })

    await emit(remote, {
      type: 'updated',
      collection: 'todos',
      item: { id: '2', title: 'Back', done: false },
      fieldTimestamps: { title: 3000, done: 3000 },
    })

    expect(ids(list)).toEqual(['1', '2'])
    expect(todo(list, '2').title).toBe('Back')
    // The tombstone is cleared, so the row is not re-suppressed on the next write.
    expect(store.$cache.tombstones.get('todos', '2')).toBeUndefined()
  })

  it('drops a frame echoing this client and applies one from another client', async () => {
    const { remote, list } = await setup('client-a')

    await emit(remote, {
      type: 'created',
      collection: 'todos',
      item: { id: '9', title: 'Mine' },
      clientId: 'client-a',
    })
    expect(ids(list)).not.toContain('9')

    await emit(remote, {
      type: 'created',
      collection: 'todos',
      item: { id: '8', title: 'Theirs' },
      clientId: 'client-b',
    })
    expect(ids(list)).toContain('8')

    // The echo was still applied on the server, so a refetch agrees with it:
    // suppression must not lose the write, only avoid applying it twice.
    await list.refresh()
    expect(ids(list)).toEqual(['1', '2', '8', '9'])
  })
})
