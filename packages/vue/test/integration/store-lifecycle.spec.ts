import type { StoreSchema } from '@rstore/shared'
import { withInjectionContext } from '#test-utils/store/vueApp'
import { createVueStack } from '#test-utils/store/vueStack'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { addCollection, cacheWriteEventHook, removeCollection, setActiveStore, useStore } from '../../src'

// Store installation, runtime schema changes, mutation telemetry and the
// devtools cache-write event are all public API that only runs inside a Vue
// app: an injection context, a live scope, a real mutation. None of them was
// exercised, so `RstorePlugin`/`useStore` and `wrapMutation` had no test at all.

afterEach(() => {
  // The stacks dispose themselves; the active-store global does not.
  setActiveStore(null)
})

const schema: StoreSchema = [{ name: 'todos' }]

/** Store backed by a scripted fake remote. */
function setup() {
  return createVueStack({
    schema,
    data: {
      todos: [{ id: '1', title: 'One' }],
      notes: [{ id: 'n1', body: 'Note' }],
      tags: [{ id: 't1', label: 'urgent', todo_id: '1' }],
    },
  })
}

describe('store installation', () => {
  it('resolves the installed store from an injection context', async () => {
    const { store } = await setup()

    const { result } = withInjectionContext(store, () => useStore())

    expect(result).toBe(store)
  })

  it('throws a usable error when no store is installed and none is active', async () => {
    await setup()

    expect(() => withInjectionContext(null, () => useStore()))
      .toThrow(/Rstore is not installed/)
  })

  it('falls back to the active store outside a component', async () => {
    const { store } = await setup()
    setActiveStore(store)

    // `setActiveStore` is the documented escape hatch for modules and tests
    // running outside a component setup.
    expect(withInjectionContext(null, () => useStore()).result).toBe(store)
  })
})

describe('runtime schema changes', () => {
  it('rejects duplicate additions and missing removals', async () => {
    const { store } = await setup()

    expect(() => addCollection(store, { name: 'todos' })).toThrow('Collection todos already exists')
    expect(() => removeCollection(store, 'missing')).toThrow('Collection missing not found')
  })

  it('rejects unknown static and reactive collection selections', async () => {
    const { store, run } = await setup()

    expect(() => store.$collection('missing')).toThrow('Collection missing not found')

    const name = ref('missing')
    const api = run(() => store.$collection(name))
    expect(() => api.findMany()).toThrow('Collection missing not found')
  })

  it('serves a collection added after the store was created', async () => {
    const { store, run, remote } = await setup()
    const name = ref('todos')
    const api = run(() => store.$collection(() => name.value))
    const query = await run(() => api.query((q: any) => q.many()))
    expect(query.data.value.map((item: any) => item.id)).toEqual(['1'])

    addCollection(store, { name: 'notes' })
    name.value = 'notes'
    await nextTick()

    // The query follows the collection ref: it invalidates and refetches
    // against a collection that did not exist when it was created.
    await vi.waitFor(() => expect(query.data.value.map((item: any) => item.id)).toEqual(['n1']))
    expect(remote.lastRequest('fetchMany')!.collection).toBe('notes')
  })

  it('resolves the relations of a collection added at runtime', async () => {
    const { store } = await setup()

    addCollection(store, {
      name: 'tags',
      relations: { todo: { to: { todos: { on: { id: 'todo_id' } } } } },
    })
    const tags = await store.tags.findMany({ include: { todo: true } })

    expect(tags[0].todo.title).toBe('One')
  })

  it('resolves a runtime relation for items already in the cache', async () => {
    const { store } = await setup()
    await store.todos.findMany()

    addCollection(store, {
      name: 'tags',
      relations: { todo: { to: { todos: { on: { id: 'todo_id' } } } } },
    })
    const tags = await store.tags.findMany({ include: { todo: true } })

    expect(tags[0].todo?.title).toBe('One')
  })

  it('resolves runtime relations against visible layered items', async () => {
    const { store } = await setup()
    await store.todos.findMany()

    store.$cache.addLayer({
      id: 'runtime-relation-target',
      collectionName: 'todos',
      state: { 2: { id: '2', title: 'Layered' } },
      deletedItems: new Set(['1']),
    })
    addCollection(store, {
      name: 'tags',
      relations: { todo: { to: { todos: { on: { id: 'todo_id' } } } } },
    })

    const tags = store.$collections.find((collection: any) => collection.name === 'tags')!
    store.$cache.writeItem({
      collection: tags,
      key: 'layered',
      item: { id: 'layered', label: 'layered', todo_id: '2' },
    })

    expect(store.tags.peekFirst('layered').todo?.title).toBe('Layered')
    expect(store.tags.peekFirst('layered').todo?.id).toBe('2')
  })

  it('clears the cached items of a removed collection', async () => {
    const { store, remote } = await setup()
    await store.todos.findMany()
    expect(store.todos.peekMany().map((item: any) => item.id)).toEqual(['1'])

    removeCollection(store, 'todos')
    addCollection(store, { name: 'todos' })

    expect(store.todos.peekMany()).toEqual([])
    // Nothing is served from the stale cache: the data comes back from the remote.
    const fetches = remote.callCount('fetchMany', 'todos')
    expect((await store.todos.findMany()).map((item: any) => item.id)).toEqual(['1'])
    expect(remote.callCount('fetchMany', 'todos')).toBe(fetches + 1)
  })
})

describe('mutation telemetry', () => {
  it('flips $loading around an async mutation and records its duration', async () => {
    const { store, remote } = await setup()
    const save = store.$wrapMutation((title: string) => store.todos.create({ id: 'x', title }))
    expect(save.$loading).toBe(false)

    const release = remote.holdNext('createItem')
    const promise = save('New')
    expect(save.$loading).toBe(true)

    release()
    await promise

    expect(save.$loading).toBe(false)
    expect(save.$error).toBeNull()
    expect(save.$time).toBeGreaterThan(0)
  })

  it('holds the rejection in $error and clears it on the next success', async () => {
    const { store, remote } = await setup()
    const save = store.$wrapMutation((id: string) => store.todos.create({ id, title: 'T' }))

    remote.failNext('createItem', new Error('backend down'))
    await expect(save('a')).rejects.toThrow('backend down')
    expect(save.$error?.message).toBe('backend down')
    expect(save.$loading).toBe(false)

    await save('b')

    expect(save.$error).toBeNull()
    expect(remote.rows('todos').map((row: any) => row.id)).toContain('b')
  })

  it('keeps a synchronous mutation synchronous and wraps a thrown non-Error', async () => {
    const { store } = await setup()

    const double = store.$wrapMutation((n: number) => n * 2)
    // Not a promise: the caller must still get the value, not a thenable.
    expect(double(21)).toBe(42)
    expect(double.$loading).toBe(false)

    const boom = store.$wrapMutation(() => {
      // eslint-disable-next-line no-throw-literal
      throw 'plain string'
    })
    expect(() => boom()).toThrow('plain string')
    expect(boom.$error).toBeInstanceOf(Error)
    expect(boom.$error?.message).toBe('plain string')
  })
})

describe('cache write event', () => {
  it('reports mutation, realtime and direct cache writes with their operation', async () => {
    const { store, run, remote } = await setup()
    const list = await run(() => store.todos.liveQuery((q: any) => q.many()))
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(1))

    const events: Array<{ collection: string, key?: string | number, operation: string }> = []
    const { off } = cacheWriteEventHook.on(payload => events.push({
      collection: payload.collection.name,
      key: payload.key,
      operation: payload.operation,
    }))
    onTestFinished(off)

    await store.todos.create({ id: '2', title: 'Two' })
    expect(events).toContainEqual({ collection: 'todos', key: '2', operation: 'write' })

    events.length = 0
    remote.emit({ type: 'updated', collection: 'todos', item: { id: '1', title: 'Renamed' } })
    await nextTick()
    expect(events).toContainEqual({ collection: 'todos', key: '1', operation: 'write' })

    events.length = 0
    remote.emit({ type: 'deleted', collection: 'todos', key: '2' })
    await nextTick()
    expect(events).toContainEqual({ collection: 'todos', key: '2', operation: 'delete' })

    events.length = 0
    store.$cache.writeItem({
      collection: store.$collections.find((c: any) => c.name === 'todos'),
      key: '3',
      item: { id: '3', title: 'Three' },
    })
    expect(events).toContainEqual({ collection: 'todos', key: '3', operation: 'write' })
    expect(list.data.value.map((item: any) => item.id)).toEqual(['1', '3'])
  })
})
