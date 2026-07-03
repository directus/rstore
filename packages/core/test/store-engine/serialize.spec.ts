import { describe, expect, it } from 'vitest'
import { buildCollection, createTestEngine } from './helpers'

describe('store-engine: serialize', () => {
  it('serializes base items, markers and modules', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'A' }, marker: 'all' })
    engine.getModuleState('counter', 'default', { count: 5 })

    const state = engine.getState()
    expect(state.collections.User).toEqual({ 1: { id: 1, name: 'A' } })
    expect(state.markers).toEqual({ all: true })
    expect(state.modules['counter:default']).toEqual({ count: 5 })
  })

  it('keeps an emptied collection entry after clear', () => {
    const collection = buildCollection('User')
    const { engine, events } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1 } })

    engine.clear()

    expect(engine.getState()).toEqual({
      collections: { User: {} },
      markers: {},
      modules: {},
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
})
