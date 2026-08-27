import { describe, expect, it, vi } from 'vitest'
import { computed, effectScope, watchEffect } from 'vue'
import { createStore } from '../src'

describe('vue cache data-core regressions', () => {
  it('updates an active direct reader for numeric-key optimistic layers', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'base' } })

    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => {
      reader((cache.readItem({ collection, key: 1 }) as any)?.label)
    }, { flush: 'sync' }))

    cache.addLayer({
      id: 'optimistic',
      collectionName: 'Todo',
      state: { 1: { label: 'layer' } },
      deletedItems: new Set(),
    })
    expect(reader).toHaveBeenLastCalledWith('layer')

    cache.removeLayer('optimistic')
    expect(reader).toHaveBeenLastCalledWith('base')
    scope.stop()
    cache.dispose()
  })

  it('refreshes base fields inherited by a cached layered wrapper', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'base', count: 0 } })
    cache.addLayer({
      id: 'optimistic',
      collectionName: 'Todo',
      state: { 1: { label: 'layer' } },
      deletedItems: new Set(),
    })
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => {
      const item = cache.readItem({ collection, key: 1 }) as any
      reader([item?.label, item?.count])
    }, { flush: 'sync' }))

    cache.writeItem({ collection, key: 1, item: { id: 1, count: 1 } })

    expect(reader).toHaveBeenLastCalledWith(['layer', 1])
    scope.stop()
    cache.dispose()
  })

  it('keeps reused wrapped values fresh outside a reactive scope', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'before' } })

    const first = cache.readItem({ collection, key: 1 }) as any
    expect(first.label).toBe('before')
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'after' } })

    expect((cache.readItem({ collection, key: 1 }) as any).label).toBe('after')
    expect((cache as any)._private.signals).toBeUndefined()
    cache.dispose()
  })

  it('keeps visible-list cache ownership private and wrappers current', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItems({
      collection,
      items: [
        { key: 1, value: { id: 1, label: 'before' } },
        { key: 2, value: { id: 2, label: 'other' } },
      ],
    })

    const first = cache.readItems({ collection }) as any[]
    first.pop()
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'after' } })

    const current = cache.readItems({ collection }) as any[]
    expect(current).toHaveLength(2)
    expect(current[0].label).toBe('after')
    cache.dispose()
  })

  it('retains the visible-list cache for field-only writes', async () => {
    const getKey = vi.fn((item: any) => item.id)
    const store = await createStore({ schema: [{ name: 'Todo', getKey }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItems({
      collection,
      items: [
        { key: 1, value: { id: 1, label: 'before' } },
        { key: 2, value: { id: 2, label: 'other' } },
      ],
    })
    const first = cache.readItems({ collection }) as any[]

    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'after' } })
    const callsBeforeRead = getKey.mock.calls.length
    const second = cache.readItems({ collection }) as any[]

    expect(getKey).toHaveBeenCalledTimes(callsBeforeRead)
    expect(second[0]).toBe(first[0])
    expect(second[0].label).toBe('after')
    cache.dispose()
  })

  it('keeps cached wrappers fresh when frozen items are replaced', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: Object.freeze({ id: 1, label: 'before' }) })
    const first = cache.readItems({ collection })[0] as any

    cache.writeItem({ collection, key: 1, item: Object.freeze({ id: 1, label: 'after' }) })
    const second = cache.readItems({ collection })[0] as any

    expect(second).toBe(first)
    expect(second.label).toBe('after')
    expect(() => {
      second.label = 'mutated'
    }).toThrow(/read-only/)
    cache.dispose()
  })

  it('keeps structured base and layer wrapper identities distinct', async () => {
    const store = await createStore({
      schema: [{ name: 'L' }, { name: 'C' }],
      plugins: [],
    })
    const cache = store.$cache
    const baseCollection = store.$collections.find(collection => collection.name === 'L')!
    const layeredCollection = store.$collections.find(collection => collection.name === 'C')!
    cache.writeItem({ collection: baseCollection, key: 'C:K', item: { id: 'C:K', label: 'base' } })
    cache.writeItem({ collection: layeredCollection, key: 'K', item: { id: 'K', label: 'under' } })
    const base = cache.readItem({ collection: baseCollection, key: 'C:K' }) as any

    cache.addLayer({
      id: 'L',
      collectionName: 'C',
      state: { K: { id: 'K', label: 'layer' } },
      deletedItems: new Set(),
    })
    const layered = cache.readItem({ collection: layeredCollection, key: 'K' }) as any

    expect(layered).not.toBe(base)
    expect(base.label).toBe('base')
    expect(layered.label).toBe('layer')
    cache.dispose()
  })

  it('resolves colliding composite relation values through tuples', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'Venue',
          relations: {
            events: {
              many: true,
              to: { Event: { on: { city: 'city', room: 'room' } } },
            },
          },
        },
        { name: 'Event' },
      ],
      plugins: [],
    })
    const cache = store.$cache
    const venue = store.$collections.find(collection => collection.name === 'Venue')!
    const event = store.$collections.find(collection => collection.name === 'Event')!
    cache.writeItem({ collection: venue, key: 1, item: { id: 1, city: 'a:b', room: 'c' } })
    cache.writeItem({ collection: event, key: 1, item: { id: 1, city: 'a:b', room: 'c' } })
    cache.writeItem({ collection: event, key: 2, item: { id: 2, city: 'a', room: 'b:c' } })

    const related = (cache.readItem({ collection: venue, key: 1 }) as any).events

    expect(related.map((item: any) => item.id)).toEqual([1])
    cache.dispose()
  })

  it('applies query and page reset state only when paused operations commit', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    const state = (cache as any)._private.state
    const oldQuery = '["Todo-many",{}]'
    const newQuery = '["Todo-many",{"next":true}]'
    state.queryMeta[oldQuery] = {}
    state.pageRefs.set(`${oldQuery}#0`, { page: 0 })

    cache.pause()
    cache.setState({
      $rstoreVersion: 1,
      collections: { Todo: { 1: { id: 1 } } },
      markers: {},
      modules: [],
      queryMeta: { [newQuery]: {} },
    })
    expect(state.queryMeta).toHaveProperty(oldQuery)
    expect(state.pageRefs.size).toBe(1)

    cache.resume()
    expect(state.queryMeta).not.toHaveProperty(oldQuery)
    expect(state.queryMeta).toHaveProperty(newQuery)
    expect(state.pageRefs.size).toBe(0)

    state.pageRefs.set(`${newQuery}#0`, { page: 0 })
    cache.pause()
    cache.clearCollection({ collection })
    expect(state.queryMeta).toHaveProperty(newQuery)
    expect(state.pageRefs.size).toBe(1)
    cache.resume()
    expect(state.queryMeta).not.toHaveProperty(newQuery)
    expect(state.pageRefs.size).toBe(0)
    cache.dispose()
  })

  it('releases bridge-owned registries when disposed', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    const privateCache = (cache as any)._private
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'base' } })
    cache.addLayer({
      id: 'optimistic',
      collectionName: collection.name,
      state: { 1: { label: 'layer' } },
      deletedItems: new Set(),
    })
    const wrappedBeforeDispose = cache.readItem({ collection, key: 1 })
    privateCache.state.queryMeta.query = {}
    privateCache.state.pageRefs.set('query#0', { page: 0 })

    expect(Object.getPrototypeOf(privateCache.layers)).toBeNull()
    expect(privateCache.layers.Todo.value).toHaveLength(1)

    cache.dispose()

    expect(privateCache.state.queryMeta).toEqual({})
    expect(privateCache.state.pageRefs.size).toBe(0)
    expect(Object.keys(privateCache.layers)).toEqual([])
    expect(cache.readItem({ collection, key: 1 })).not.toBe(wrappedBeforeDispose)
  })

  it('updates a computed list without allocating an engine subscription', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'first' } })
    const labels = computed(() => cache.readItems({ collection }).map((item: any) => item.label))

    expect(labels.value).toEqual(['first'])
    cache.writeItem({ collection, key: 2, item: { id: 2, label: 'second' } })

    expect(labels.value).toEqual(['first', 'second'])
    cache.setState({
      collections: { Todo: { 3: { id: 3, label: 'reset' } } },
      markers: {},
      modules: {},
      queryMeta: {},
    })
    expect(labels.value).toEqual(['reset'])
    cache.clear()
    expect(labels.value).toEqual([])
    cache.dispose()
  })

  it('invalidates missing-item readers when setState adds their record', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => {
      reader((cache.readItem({ collection, key: 1 }) as any)?.label)
    }, { flush: 'sync' }))

    cache.setState({
      collections: { Todo: { 1: { id: 1, label: 'restored' } } },
      markers: {},
      modules: {},
      queryMeta: {},
    })

    expect(reader).toHaveBeenLastCalledWith('restored')
    expect(cache.readItems({ collection }).map((item: any) => item.label)).toEqual(['restored'])
    scope.stop()
    cache.dispose()
  })

  it('keeps an active reader through garbage collection', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'saved' } })
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => {
      reader((cache.readItem({ collection, key: 1 }) as any)?.label)
    }, { flush: 'sync' }))

    const item = cache.readItem({ collection, key: 1 })!
    cache.garbageCollectItem({ collection, item })

    expect(reader).toHaveBeenLastCalledWith(undefined)
    scope.stop()
    cache.dispose()
  })

  it('keeps an evicted wrapper readable and reactive after reinsertion', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'before' } })
    const retained = cache.readItem({ collection, key: 1 }) as any
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => reader(retained.label), { flush: 'sync' }))

    cache.deleteItem({ collection, key: 1 })
    expect(retained.label).toBe('before')
    cache.writeItem({ collection, key: 1, item: { id: 1, label: 'after' } })

    expect(retained.label).toBe('after')
    expect(reader).toHaveBeenLastCalledWith('after')
    scope.stop()
    cache.dispose()
  })

  it('updates active indexed lists when an optimistic layer deletes a record', async () => {
    const store = await createStore({
      schema: [
        {
          name: 'Author',
          relations: {
            posts: { many: true, to: { Post: { on: { authorId: 'id' } } } },
          },
        },
        { name: 'Post' },
      ],
      plugins: [],
    })
    const cache = store.$cache
    const post = store.$collections.find(collection => collection.name === 'Post')!
    cache.writeItem({ collection: post, key: 1, item: { id: 1, authorId: 1 } })
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => {
      reader(cache.readItems({ collection: post, indexKey: 'authorId', indexValue: 1 }).length)
    }, { flush: 'sync' }))

    cache.addLayer({ id: 'hide', collectionName: 'Post', state: {}, deletedItems: new Set(['1']) })
    expect(reader).toHaveBeenLastCalledWith(0)
    cache.removeLayer('hide')
    expect(reader).toHaveBeenLastCalledWith(1)
    scope.stop()
    cache.dispose()
  })

  it('keeps module state identity and reactivity through reset', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const moduleCache = cache as any
    const module = moduleCache.getModuleState('counter', 'main', { count: 0 }) as { count?: number }
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => reader(module.count), { flush: 'sync' }))

    cache.setState({
      collections: {},
      markers: {},
      modules: { 'counter:main': { count: 2 } },
      queryMeta: {},
    })
    expect(reader).toHaveBeenLastCalledWith(2)
    expect(moduleCache.getModuleState('counter', 'main', { count: 999 })).toBe(module)

    cache.clear()
    expect(reader).toHaveBeenLastCalledWith(undefined)
    scope.stop()
    cache.dispose()
  })

  it('wraps module state restored before its first cache read', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const moduleCache = cache as any
    cache.setState({
      collections: {},
      markers: {},
      modules: { 'counter:late': { count: 3 } },
      queryMeta: {},
    })
    const module = moduleCache.getModuleState('counter', 'late', { count: 0 }) as { count: number }
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => reader(module.count), { flush: 'sync' }))

    cache.setState({
      collections: {},
      markers: {},
      modules: { 'counter:late': { count: 4 } },
      queryMeta: {},
    })

    expect(reader).toHaveBeenLastCalledWith(4)
    scope.stop()
    cache.dispose()
  })

  it('updates reactive array module state in place', async () => {
    const store = await createStore({ schema: [{ name: 'Todo' }], plugins: [] })
    const cache = store.$cache
    const moduleCache = cache as any
    const module = moduleCache.getModuleState('list', 'main', [1, 2]) as number[]
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => reader(module.length), { flush: 'sync' }))

    cache.setState({
      collections: {},
      markers: {},
      modules: { 'list:main': [9] },
      queryMeta: {},
    })
    expect(module).toEqual([9])
    expect(reader).toHaveBeenLastCalledWith(1)

    cache.clear()
    expect(module).toEqual([])
    expect(reader).toHaveBeenLastCalledWith(0)
    scope.stop()
    cache.dispose()
  })
})
