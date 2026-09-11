import { describe, expect, it } from 'vitest'
import { buildCollection, createTestEngine } from './helpers'

describe('store-engine: serialize', () => {
  it('serializes base items, markers and modules', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'A' }, marker: 'all' })
    engine.getModuleState('counter', 'default', { count: 5 })

    const state = engine.getState()
    expect(state.$rstoreVersion).toBe(1)
    expect(state.collections.User).toEqual({ 1: { id: 1, name: 'A' } })
    expect(state.markers).toEqual({ all: true })
    expect(state.modules).toEqual([
      { name: 'counter', key: 'default', state: { count: 5 } },
    ])
  })

  it('keeps an emptied collection entry after clear', () => {
    const collection = buildCollection('User')
    const { engine, events } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1 } })

    engine.clear()

    expect(engine.getState()).toEqual({
      $rstoreVersion: 1,
      collections: { User: {} },
      markers: {},
      modules: [],
      queryMeta: {},
    })
    expect(events.reset).toBe(1)
  })

  it('round-trips through setState (base + indexes rebuilt)', () => {
    const collection = buildCollection('Post', {
      indexes: new Map([['authorId', ['authorId']]]),
    })
    const { engine } = createTestEngine([collection])

    engine.setState({
      collections: { Post: { 1: { id: 1, authorId: 'a' }, 2: { id: 2, authorId: 'a' } } },
      markers: { all: true },
      modules: {},
      queryMeta: {},
    })

    expect(engine.readItemRaw({ collection, key: 1 })).toEqual({ id: 1, authorId: 'a' })
    expect(engine.hasMarker('all')).toBe(true)
    expect(engine.resolveKeys({ collection, indexKey: 'authorId', indexValue: 'a' }).map(String).sort()).toEqual(['1', '2'])
  })

  it('derives each collection key once before committing hydrated causality', () => {
    let keyReads = 0
    const collection = buildCollection('User', {
      getKey: (item) => {
        keyReads++
        if (keyReads > 1)
          throw new Error('key resolver ran after collection commit')
        return item.id
      },
    })
    const { engine } = createTestEngine([collection])

    expect(() => engine.setState({
      $rstoreVersion: 1,
      collections: { User: { 1: { id: 1, name: 'Ada' } } },
      markers: {},
      modules: [],
      queryMeta: {},
      fieldTimestamps: { User: { 1: { name: 10 } } },
    })).not.toThrow()

    expect(keyReads).toBe(1)
    expect(engine.readItemRaw({ collection, key: 1 })).toEqual({ id: 1, name: 'Ada' })
    expect(engine.readFieldTimestamps({ collectionName: 'User', key: 1 })).toEqual({ name: 10 })
  })

  it('keeps query metadata when hydrating its own live snapshot', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    const queryId = '["User-many",{}]'
    engine.getQueryMeta()[queryId] = { $queryTracking: { items: {}, skipped: true } }

    engine.setState(engine.getState())

    expect(engine.getQueryMeta()).toEqual({ [queryId]: { $queryTracking: { items: {}, skipped: true } } })
  })

  it('returns a stable module object across calls', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    const a = engine.getModuleState('m', 'k', { count: 0 })
    const b = engine.getModuleState('m', 'k', { count: 999 })

    expect(a).toBe(b)
    expect(b.count).toBe(0)
  })

  it('empties module contents in place on clear (preserves reference)', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    const mod = engine.getModuleState('m', 'k', { count: 5 })

    engine.clear()

    expect(mod).toEqual({})
    // Same reference so any reactive wrapper over it stays valid.
    expect(engine.getModuleState('m', 'k', { count: 1 })).toBe(mod)
  })

  it('replaces an array module in place on setState without leaving stale slots', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    const mod = engine.getModuleState('list', 'k', [1, 2, 3]) as number[]

    engine.setState({
      collections: {},
      markers: {},
      modules: { 'list:k': [9] },
      queryMeta: {},
    })

    // Truncated in place (length corrected, no leftover holes), same reference.
    expect(mod).toEqual([9])
    expect(mod.length).toBe(1)
    expect(engine.getModuleState('list', 'k', [])).toBe(mod)
  })

  it('empties an array module to length 0 on clear', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    const mod = engine.getModuleState('list', 'k', [1, 2, 3]) as number[]

    engine.clear()

    expect(Array.isArray(mod)).toBe(true)
    expect(mod.length).toBe(0)
  })

  it('keeps colliding module tuples independent', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    const first = engine.getModuleState('a:b', 'c', { value: 1 })
    const second = engine.getModuleState('a', 'b:c', { value: 2 })

    expect(first).not.toBe(second)
    expect(first).toEqual({ value: 1 })
    expect(second).toEqual({ value: 2 })
  })

  it('accepts a legacy snapshot with missing optional fields', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    expect(() => engine.setState({ collections: { User: { 1: { id: 1 } } } })).not.toThrow()
    expect(engine.readItemRaw({ collection, key: 1 })).toEqual({ id: 1 })

    engine.writeItem({ collection, key: 2, item: { id: 2 } })
    expect(engine.resolveKeys({ collection })).toEqual([1, 2])
  })

  it('migrates registered and late legacy module records', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    const registered = engine.getModuleState('registered', 'main', { count: 0 })

    engine.setState({
      collections: {},
      modules: {
        'registered:main': { count: 1 },
        'late:main': { count: 2 },
      },
    })

    expect(registered).toEqual({ count: 1 })
    expect(engine.getState().modules).toContainEqual({ legacyKey: 'late:main', state: { count: 2 } })
    expect(engine.getModuleState('late', 'main', { count: 0 })).toEqual({ count: 2 })
    expect(engine.getState().modules).not.toContainEqual({ legacyKey: 'late:main', state: { count: 2 } })
  })

  it('rejects an ambiguous legacy module key before changing state', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    const first = engine.getModuleState('a:b', 'c', { value: 1 })
    const second = engine.getModuleState('a', 'b:c', { value: 2 })

    expect(() => engine.setState({
      collections: { User: { 2: { id: 2 } } },
      modules: { 'a:b:c': { value: 3 } },
    })).toThrow(/Ambiguous legacy module key/)

    expect(engine.resolveKeys({ collection })).toEqual([1])
    expect(first).toEqual({ value: 1 })
    expect(second).toEqual({ value: 2 })
  })

  it('rejects a second late tuple claiming an already migrated legacy key', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.setState({ collections: {}, modules: { 'a:b:c': { value: 3 } } })

    expect(engine.getModuleState('a:b', 'c', { value: 1 })).toEqual({ value: 3 })
    expect(() => engine.getModuleState('a', 'b:c', { value: 2 }))
      .toThrow(/Ambiguous legacy module key/)
  })

  it('rejects object-array module kind changes before changing collections', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    const module = engine.getModuleState('settings', 'main', { enabled: true })

    expect(() => engine.setState({
      $rstoreVersion: 1,
      collections: { User: { 2: { id: 2 } } },
      markers: {},
      modules: [{ name: 'settings', key: 'main', state: [] }],
      queryMeta: {},
    })).toThrow(/module.*kind/i)

    expect(engine.resolveKeys({ collection })).toEqual([1])
    expect(module).toEqual({ enabled: true })
  })

  it('rejects immutable module replacement before changing collections', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    const module = engine.getModuleState('settings', 'main', Object.freeze({ enabled: true }))

    expect(() => engine.setState({
      $rstoreVersion: 1,
      collections: { User: { 2: { id: 2 } } },
      markers: {},
      modules: [{ name: 'settings', key: 'main', state: { enabled: false } }],
      queryMeta: {},
    })).toThrow(/module.*immutable/i)

    expect(engine.resolveKeys({ collection })).toEqual([1])
    expect(module).toEqual({ enabled: true })
    expect(() => engine.clear()).toThrow(/module.*immutable/i)
    expect(engine.resolveKeys({ collection })).toEqual([1])
  })

  it('preserves unclaimed legacy modules across versioned round-trips', () => {
    const collection = buildCollection('User')
    const first = createTestEngine([collection]).engine
    first.setState({ collections: {}, modules: { 'unknown:key': { value: 4 } } })

    const second = createTestEngine([collection]).engine
    second.setState(first.getState())

    expect(second.getState().modules).toEqual([
      { legacyKey: 'unknown:key', state: { value: 4 } },
    ])
  })

  it('rejects conflicting exact and legacy module entries before changing state', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    engine.pause()

    expect(() => engine.setState({
      $rstoreVersion: 1,
      collections: { User: { 2: { id: 2 } } },
      markers: {},
      modules: [
        { name: 'a:b', key: 'c', state: { value: 1 } },
        { legacyKey: 'a:b:c', state: { value: 2 } },
      ],
      queryMeta: {},
    })).toThrow(/exact and legacy module entries/)

    engine.resume()
    expect(engine.resolveKeys({ collection })).toEqual([1])
  })

  it('serializes prototype-like collection and item keys as data', () => {
    const collection = buildCollection('__proto__', { getKey: item => item.key })
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: '__proto__', item: { key: '__proto__', value: 1 } })

    const state = engine.getState()
    const serializedCollection = Reflect.get(state.collections, '__proto__')!
    expect(Object.getPrototypeOf(state.collections)).toBeNull()
    expect(Object.getPrototypeOf(serializedCollection)).toBeNull()
    expect(Reflect.get(serializedCollection, '__proto__')).toEqual({ key: '__proto__', value: 1 })
  })

  it('rejects malformed versioned shapes before queueing any reset', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.pause()

    expect(() => engine.setState({
      $rstoreVersion: 1,
      collections: [],
      markers: {},
      modules: [],
      queryMeta: {},
    } as any)).toThrow('Cache snapshot collections must be an object record')

    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    engine.resume()
    expect(engine.resolveKeys({ collection })).toEqual([1])
  })

  it('ignores unknown snapshot collections while hydrating known rows', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    engine.setState({
      collections: {
        User: { 1: { id: 1 } },
        RemovedCollection: { 2: { id: 2 } },
      },
    })

    expect(engine.resolveKeys({ collection })).toEqual([1])
    expect(engine.getState().collections).not.toHaveProperty('RemovedCollection')
  })

  it('detaches queued collection structure from later input mutation', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    const rows: Record<string, any> = { 1: { id: 1 } }
    const snapshot = { collections: { User: rows } }

    engine.pause()
    engine.setState(snapshot)
    delete rows[1]
    rows[2] = { id: 2 }
    engine.resume()

    expect(engine.resolveKeys({ collection })).toEqual([1])
  })

  it('detaches serialized marker and query-meta records from live containers', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1 }, marker: '__proto__' })
    engine.getQueryMeta().query = {}

    const snapshot = engine.getState()
    Reflect.set(snapshot.markers, '__proto__', false)
    delete snapshot.queryMeta.query

    expect(engine.hasMarker('__proto__')).toBe(true)
    expect(engine.getQueryMeta()).toHaveProperty('query')
  })
})
