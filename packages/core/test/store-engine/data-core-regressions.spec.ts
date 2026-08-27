import { describe, expect, it, vi } from 'vitest'
import { buildCollection, buildLayer, createTestEngine } from './helpers'

describe('store-engine: data-core regressions', () => {
  it('treats numeric and string keys as one entity across indexes and timestamps', () => {
    const collection = buildCollection('Post', { indexes: new Map([['authorId', ['authorId']]]) })
    const { engine } = createTestEngine([collection])
    const observer = vi.fn()
    engine.observeItem('Post', '1', observer)

    engine.writeItem({ collection, key: 1, item: { id: 1, authorId: 'a', title: 'first' } })
    engine.writeFieldTimestamps({ collectionName: 'Post', key: 1, timestamps: { title: 10 } })
    engine.writeItem({ collection, key: '1', item: { id: 1, authorId: 'b', title: 'second' } })

    expect(engine.resolveKeys({ collection })).toEqual([1])
    expect(engine.readItemRaw({ collection, key: 1 })?.title).toBe('second')
    expect(engine.readItemRaw({ collection, key: '1' })?.title).toBe('second')
    expect(engine.readFieldTimestamps({ collectionName: 'Post', key: '1' })).toEqual({ title: 10 })
    expect(engine.resolveKeys({ collection, indexKey: 'authorId', indexValue: 'a' })).toEqual([])
    expect(engine.resolveKeys({ collection, indexKey: 'authorId', indexValue: 'b' })).toEqual([1])
    expect(observer).toHaveBeenCalledTimes(2)

    engine.deleteItem({ collection, key: '1' })
    expect(engine.resolveKeys({ collection })).toEqual([])
    expect(engine.readItemRaw({ collection, key: 1 })).toBeUndefined()
  })

  it('reconciles indexes and observers for layer deletes', () => {
    const collection = buildCollection('Post', { indexes: new Map([['authorId', ['authorId']]]) })
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1, authorId: 'a' } })
    const observer = vi.fn()
    engine.observeIndex('Post', 'authorId', 'a', observer)

    engine.addLayer(buildLayer('delete', 'Post', {}, ['1']))
    expect(engine.resolveKeys({ collection, indexKey: 'authorId', indexValue: 'a' })).toEqual([])
    expect(observer).toHaveBeenCalledTimes(1)

    engine.removeLayer('delete')
    expect(engine.resolveKeys({ collection, indexKey: 'authorId', indexValue: 'a' })).toEqual([1])
    expect(observer).toHaveBeenCalledTimes(2)
  })

  it('rebuilds effective indexes when state changes or clears under a layer', () => {
    const collection = buildCollection('Post', { indexes: new Map([['authorId', ['authorId']]]) })
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1, authorId: 'a' } })
    engine.addLayer(buildLayer('move', 'Post', { 1: { authorId: 'b' } }))

    engine.setState({
      collections: { Post: { 1: { id: 1, authorId: 'c' } } },
      markers: {},
      modules: {},
      queryMeta: {},
    })
    expect(engine.resolveKeys({ collection, indexKey: 'authorId', indexValue: 'b' })).toEqual([1])
    expect(engine.resolveKeys({ collection, indexKey: 'authorId', indexValue: 'c' })).toEqual([])

    engine.clear()
    expect(engine.resolveKeys({ collection, indexKey: 'authorId', indexValue: 'b' })).toEqual([1])
  })

  it('indexes final CRDT values instead of stale incoming fields', () => {
    const collection = buildCollection('Post', { indexes: new Map([['authorId', ['authorId']]]) })
    const { engine } = createTestEngine([collection])

    engine.writeItem({ collection, key: 1, item: { id: 1, authorId: 'local' }, fieldTimestamps: { authorId: 100 } })
    engine.writeItem({ collection, key: 1, item: { id: 1, authorId: 'stale' }, fieldTimestamps: { authorId: 50 } })

    expect(engine.readItemRaw({ collection, key: 1 })?.authorId).toBe('local')
    expect(engine.resolveKeys({ collection, indexKey: 'authorId', indexValue: 'local' })).toEqual([1])
    expect(engine.resolveKeys({ collection, indexKey: 'authorId', indexValue: 'stale' })).toEqual([])
  })

  it('invalidates subscribed item, list and index readers on reset', () => {
    const collection = buildCollection('Post', { indexes: new Map([['authorId', ['authorId']]]) })
    const { engine } = createTestEngine([collection])
    const item = vi.fn()
    engine.writeItem({ collection, key: 2, item: { id: 2, authorId: 'a' } })
    const existingItem = vi.fn()
    const list = vi.fn()
    const index = vi.fn()
    engine.observeItem('Post', '1', item)
    engine.observeItem('Post', 2, existingItem)
    engine.observeList('Post', list)
    engine.observeIndex('Post', 'authorId', 'a', index)

    engine.setState({
      collections: { Post: { 1: { id: 1, authorId: 'a' } } },
      markers: {},
      modules: {},
      queryMeta: {},
    })
    expect(item).toHaveBeenCalledTimes(1)
    expect(existingItem).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledTimes(1)
    expect(index).toHaveBeenCalledTimes(1)

    engine.clear()
    expect(item).toHaveBeenCalledTimes(2)
    expect(existingItem).toHaveBeenCalledTimes(2)
    expect(list).toHaveBeenCalledTimes(2)
    expect(index).toHaveBeenCalledTimes(2)
  })

  it('reuses layered resolved values until that entity changes', () => {
    const collection = buildCollection('Post')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1, title: 'one' } })
    engine.writeItem({ collection, key: 2, item: { id: 2, title: 'two' } })
    engine.addLayer(buildLayer('edit', 'Post', { 1: { title: 'optimistic' } }))

    const first = engine.readItemRaw({ collection, key: 1 })
    expect(engine.readItemRaw({ collection, key: 1 })).toBe(first)
    engine.writeItem({ collection, key: 2, item: { id: 2, title: 'changed' } })
    expect(engine.readItemRaw({ collection, key: 1 })).toBe(first)
  })

  it('keeps empty-string values in indexes', () => {
    const collection = buildCollection('Post', { indexes: new Map([['slug', ['slug']]]) })
    const { engine } = createTestEngine([collection])

    engine.writeItem({ collection, key: 1, item: { id: 1, slug: '' } })

    expect(engine.resolveKeys({ collection, indexKey: 'slug', indexValue: '' })).toEqual([1])
  })

  it('upgrades a layer fallback key to the collection-derived type', () => {
    const collection = buildCollection('Post')
    const { engine } = createTestEngine([collection])
    engine.addLayer(buildLayer('hide', 'Post', {}, ['1']))

    engine.writeItem({ collection, key: 1, item: { id: 1, title: 'base' } })
    engine.removeLayer('hide')

    expect(engine.resolveKeys({ collection })).toEqual([1])
  })

  it('drains a large paused queue in FIFO order and releases consumed storage', () => {
    const collection = buildCollection('Post')
    const { engine, events } = createTestEngine([collection])
    engine.pause()
    for (let key = 1; key <= 2_000; key++) {
      engine.writeItem({ collection, key, item: { id: key } })
    }

    engine.resume()

    expect(engine.resolveKeys({ collection })).toHaveLength(2_000)
    expect(events.afterWrite.map(event => event.key).slice(0, 3)).toEqual([1, 2, 3])
    expect('_ctx' in engine).toBe(false)
  })
})
