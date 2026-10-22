import { createCoreStore } from '#test-utils/store/realCacheStore'
import { describe, expect, it } from 'vitest'
import { computed, customRef, nextTick, reactive, ref, toRef } from 'vue'
import { defineModule } from '../../vue/src'
import { projectValue } from '../src/projection'
import { createRstoreDevtools } from '../src/runtime'
import { createVueDevtoolsAdapter } from '../src/vue/adapter'

/** Real Vue observation and projection: no synthetic store or reactivity replacement. */
describe('optional Vue devtools adapter', () => {
  it('observes modules and layers registered after observation starts, then releases them', async () => {
    const fixture = await createCoreStore({ schema: [{ name: 'todos' }], tombstoneGc: false })
    const changes: string[] = []
    const stop = createVueDevtoolsAdapter().observe!(fixture.store, view => changes.push(view ?? 'modules'))
    try {
      const module = await defineModule('late', ({ defineState }) => ({ state: defineState({ count: 1 }) }))(fixture.store as any)
      fixture.cache.addLayer(reactive({ id: 'late', collectionName: 'todos', state: {}, deletedItems: new Set<string | number>(), optimistic: true, skip: false }))
      await nextTick()
      changes.length = 0
      module.state.count = 2
      fixture.cache.getLayer('late')!.skip = true
      await nextTick()
      expect(changes.sort()).toEqual(['cache', 'modules'])
      stop()
      changes.length = 0
      const later = await defineModule('later', ({ defineState }) => ({ state: defineState({ count: 1 }) }))(fixture.store as any)
      fixture.cache.addLayer(reactive({ id: 'later', collectionName: 'todos', state: {}, deletedItems: new Set<string | number>(), optimistic: true, skip: false }))
      later.state.count = 3
      fixture.cache.getLayer('late')!.skip = false
      await nextTick()
      expect(changes).toEqual([])
    }
    finally {
      stop()
      fixture.dispose()
    }
  })

  it('inspects overlay identity without calling application key callbacks or key accessors', async () => {
    let keyCallbacks = 0
    let keyGetters = 0
    const fixture = await createCoreStore({ schema: [{ name: 'items', getKey(item) {
      keyCallbacks++
      return item.id
    } }], syncImmediately: false, tombstoneGc: false })
    fixture.cache.addLayer({ id: 'pending', collectionName: 'items', state: {
      'one': { title: 'safe', get id() {
        keyGetters++
        return 'one'
      } },
      '2': { id: 2, title: 'numeric' },
      '02': { id: '02', title: 'string' },
    }, deletedItems: new Set() })
    const runtime = createRstoreDevtools()
    const adapter = createVueDevtoolsAdapter()
    let stop: (() => void) | undefined
    try {
      const rows = Array.from(fixture.cache.inspect!().collections[0]!.effectiveRows())
      expect(rows.map(row => row.key)).toEqual([2, 'one', '02'])
      const layers = Array.from(fixture.cache.inspect!().layers())
      expect(Array.from(layers[0]!.rows(), row => row.key)).toEqual([2, 'one', '02'])
      const { target } = runtime.attachStore(fixture.store, { id: 'safe-identity', adapter })
      const reply = runtime.read({ method: 'rstore:get-cache', target, collection: 'items', page: { limit: 3 } })
      expect(reply).toMatchObject({ data: { rows: expect.arrayContaining([
        { key: 'one', value: { kind: 'object', entries: expect.arrayContaining([['id', expect.objectContaining({ kind: 'accessor' })]]) } },
      ]) } })
      stop = adapter.observe!(fixture.store, () => {})
      expect({ keyCallbacks, keyGetters }).toEqual({ keyCallbacks: 0, keyGetters: 0 })
    }
    finally {
      stop?.()
      runtime.dispose()
      fixture.dispose()
    }
  })

  // Real Vue cache/runtime subscription: borrowed layer edits update diagnostic rows
  // independently from application memoization, until subscription release.
  it('invalidates live cache subscribers after reactive layer edits and deletions, then releases observation', async () => {
    const fixture = await createCoreStore({ schema: [{ name: 'todos' }], tombstoneGc: false })
    fixture.cache.addLayer(reactive({ id: 'pending', collectionName: 'todos', state: { one: { id: 'one', title: 'before' }, two: { id: 'two', title: 'retained' } }, deletedItems: new Set<string | number>() }))
    const runtime = createRstoreDevtools()
    const registration = runtime.attachStore(fixture.store, { id: 'layer-data', adapter: createVueDevtoolsAdapter() })
    const changes: string[] = []
    const stop = runtime.subscribe((event) => {
      if (event.view === 'cache')
        changes.push(event.view)
    }, registration.target, 'cache')
    try {
      const layer = fixture.cache.getLayer('pending')!
      layer.state.one.title = 'after'
      await nextTick()
      await Promise.resolve()
      expect(fixture.cache.readItem({ collection: fixture.store.$collections[0]!, key: 'one' })).toMatchObject({ title: 'after' })
      expect(changes, 'inspector must refresh changed layer row').toEqual(['cache'])
      layer.deletedItems.add('one')
      await nextTick()
      await Promise.resolve()
      const rows = Array.from(fixture.cache.inspect!().collections[0]!.effectiveRows())
      expect(rows.map(row => [row.key, (row.value as any).title])).toEqual([['two', 'retained']])
      // App reads preserve pre-migration memo until cache-owned invalidation.
      expect(fixture.cache.readItem({ collection: fixture.store.$collections[0]!, key: 'one' })).toMatchObject({ title: 'after' })
      expect(changes, 'inspector must refresh deleted layer row').toEqual(['cache', 'cache'])
      stop()
      layer.state.two.title = 'after release'
      await nextTick()
      expect(changes).toEqual(['cache', 'cache'])
      fixture.cache.removeLayer('pending')
      expect(fixture.cache.readItem({ collection: fixture.store.$collections[0]!, key: 'one' })).toBeUndefined()
    }
    finally {
      stop()
      runtime.dispose()
      fixture.dispose()
    }
  })

  it('bounds examined accessor keys during real module observation without reaching tail', async () => {
    const fixture = await createCoreStore({ schema: [{ name: 'todos' }], tombstoneGc: false })
    let getters = 0
    let tailDescriptors = 0
    const source = {}
    for (let index = 0; index < 2000; index++) {
      Object.defineProperty(source, `field${index}`, { enumerable: true, get() {
        getters++
        return index
      } })
    }
    Object.defineProperty(source, 'tail', { enumerable: true, get() {
      getters++
      return 'tail'
    } })
    const observed = new Proxy(source, {
      getOwnPropertyDescriptor(object, key) {
        if (key === 'tail')
          tailDescriptors++
        return Reflect.getOwnPropertyDescriptor(object, key)
      },
    })
    defineModule('bounded', () => ({ observed }))(fixture.store as any)
    const stop = createVueDevtoolsAdapter().observe!(fixture.store, () => {})
    try {
      expect(tailDescriptors).toBe(0)
      expect(getters).toBe(0)
    }
    finally {
      stop()
      fixture.dispose()
    }
  })

  it('preserves plain ref-lookalike accessors while normal Vue custom refs still unwrap', async () => {
    const fixture = await createCoreStore({ schema: [{ name: 'todos' }], tombstoneGc: false })
    let getters = 0
    const lookalike = { __v_isRef: true, get value() {
      getters++
      return 42
    } }
    const adapter = createVueDevtoolsAdapter()
    let stop: (() => void) | undefined
    try {
      expect(projectValue(lookalike, adapter).value).toEqual({ kind: 'object', entries: [
        ['__v_isRef', true],
        ['value', { kind: 'accessor', reason: 'getter not invoked', path: '$/entries/1/1' }],
      ] })
      const inheritedFlag = Object.create({ __v_isRef: true })
      Object.defineProperty(inheritedFlag, 'value', { enumerable: true, get() {
        getters++
        return 99
      } })
      expect(projectValue(inheritedFlag, adapter).value).toEqual({ kind: 'object', entries: [
        ['value', { kind: 'accessor', reason: 'getter not invoked', path: '$/entries/0/1' }],
      ] })
      const inheritedValue = Object.create({ __v_isRef: true, get value() {
        getters++
        return 101
      } })
      expect(projectValue(inheritedValue, adapter).value).toEqual({ kind: 'object', entries: [] })
      defineModule('safe', () => ({ lookalike, inheritedFlag, inheritedValue }))(fixture.store as any)
      stop = adapter.observe!(fixture.store, () => {})
      expect(getters).toBe(0)
      const genuine = customRef(() => ({ get: () => 7, set: () => {} }))
      expect(projectValue(genuine, adapter).value).toBe(7)
      const genuineRefs = [ref(8), computed(() => 9), toRef({ count: 10 }, 'count'), toRef(() => 11)]
      expect(genuineRefs.map(genuineRef => projectValue(genuineRef, adapter).value)).toEqual([8, 9, 10, 11])
    }
    finally {
      stop?.()
      fixture.dispose()
    }
  })

  it('reports public optimistic layer flag changes as cache invalidation without module noise', async () => {
    const fixture = await createCoreStore({ schema: [{ name: 'todos' }], tombstoneGc: false })
    fixture.cache.addLayer(reactive({ id: 'pending', collectionName: 'todos', state: { row: { id: 'row', title: 'pending' } }, deletedItems: new Set<string | number>(), optimistic: true, skip: false }))
    const changes: string[] = []
    const stop = createVueDevtoolsAdapter().observe!(fixture.store, (view?: string) => changes.push(view ?? 'modules'))
    try {
      fixture.cache.getLayer('pending')!.skip = true
      await nextTick()
      expect(changes).toEqual(['cache'])
      stop()
      fixture.cache.getLayer('pending')!.skip = false
      await nextTick()
      expect(changes).toEqual(['cache'])
    }
    finally {
      stop()
      fixture.dispose()
    }
  })

  it('unwraps nested refs and reactive cycles without executing accessors', () => {
    const adapter = createVueDevtoolsAdapter()
    let getters = 0
    const source: any = reactive({ count: ref(2), nested: { title: ref('safe') } })
    source.self = source
    Object.defineProperty(source, 'secret', { enumerable: true, get() {
      getters++
      return 42
    } })
    expect(projectValue(source, adapter).value).toEqual({ kind: 'object', entries: [
      ['count', 2],
      ['nested', { kind: 'object', entries: [['title', 'safe']] }],
      ['self', { kind: 'reference', path: '$' }],
      ['secret', { kind: 'accessor', reason: 'getter not invoked', path: '$/entries/3/1' }],
    ] })
    expect(getters).toBe(0)
    const callable = function inspectOnly() {}
    Object.defineProperty(callable, '__v_isRef', { get() {
      getters++
    } })
    expect(projectValue(callable, adapter).value).toEqual({ kind: 'function', value: '[Function inspectOnly]' })
    expect(getters).toBe(0)
    const disguised = {
      get __v_isRef() {
        getters++
        return true
      },
      get __v_raw() {
        getters++
        return source
      },
    }
    expect(projectValue(disguised, adapter).value).toMatchObject({ kind: 'object', entries: [
      ['__v_isRef', { kind: 'accessor' }],
      ['__v_raw', { kind: 'accessor' }],
    ] })
    expect(getters).toBe(0)
  })

  it('observes actual module state until its lease ends, without invoking module getters', async () => {
    const fixture = await createCoreStore({ schema: [{ name: 'todos' }], tombstoneGc: false })
    const module = defineModule('counter', ({ defineState }) => ({ state: defineState({ count: 1, nested: { title: 'old' } }) }))(fixture.store as any)
    const state = module.state
    let getterCalls = 0
    Object.defineProperty(module, 'danger', { enumerable: true, get() {
      getterCalls++
      return 1
    } })
    let changes = 0
    const stop = createVueDevtoolsAdapter().observe!(fixture.store, () => changes++)
    try {
      state.count = 2
      state.nested.title = 'new'
      await nextTick()
      expect(changes).toBe(1)
      expect(getterCalls).toBe(0)
      stop()
      state.count = 3
      await nextTick()
      expect(changes).toBe(1)
    }
    finally {
      stop()
      fixture.dispose()
    }
  })

  it('runtime and actual store disposal stop observation without stopping another registration', async () => {
    const first = await createCoreStore({ schema: [{ name: 'todos' }], tombstoneGc: false })
    const second = await createCoreStore({ schema: [{ name: 'todos' }], tombstoneGc: false })
    const runtime = createRstoreDevtools()
    const firstModule = defineModule('counter', ({ defineState }) => ({ state: defineState({ count: 1 }) }))(first.store as any)
    const secondModule = defineModule('counter', ({ defineState }) => ({ state: defineState({ count: 9 }) }))(second.store as any)
    const firstRegistration = runtime.attachStore(first.store, { id: 'first', adapter: createVueDevtoolsAdapter() })
    const secondRegistration = runtime.attachStore(second.store, { id: 'second', adapter: createVueDevtoolsAdapter() })
    const revisions: string[] = []
    const releases = [firstRegistration, secondRegistration].map(registration => runtime.subscribe((event) => {
      if (event.view === 'modules')
        revisions.push(event.target!.storeId)
    }, registration.target, 'modules'))
    try {
      first.dispose()
      firstModule.state.count = 2
      secondModule.state.count = 10
      await nextTick()
      await Promise.resolve()
      expect(revisions).toEqual(['second'])
      runtime.dispose()
      secondModule.state.count = 11
      await nextTick()
      expect(revisions).toEqual(['second'])
    }
    finally {
      for (const release of releases) release()
      runtime.dispose()
      first.dispose()
      second.dispose()
    }
  })
})
