import { describe, expect, it } from 'vitest'
import { buildCollection, createTestEngine } from './helpers'

describe('store-engine: write & read', () => {
  it('writes and reads back a raw item', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Alice' } })

    expect(engine.readItemRaw({ collection, key: 1 })).toEqual({ id: 1, name: 'Alice' })
  })

  it('returns undefined for a missing key', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    expect(engine.readItemRaw({ collection, key: 99 })).toBeUndefined()
  })

  it('merges fields on update of an existing item', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Alice', age: 30 } })
    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Alicia' } })

    expect(engine.readItemRaw({ collection, key: 1 })).toEqual({ id: 1, name: 'Alicia', age: 30 })
  })

  it('deletes an item', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Alice' } })
    engine.deleteItem({ collection, key: 1 })

    expect(engine.readItemRaw({ collection, key: 1 })).toBeUndefined()
  })

  it('stores a frozen item verbatim', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    const frozen = Object.freeze({ id: 1, name: 'Frozen' })

    engine.writeItem({ collection, key: 1, item: frozen })

    expect(engine.readItemRaw({ collection, key: 1 })).toBe(frozen)
  })

  it('writes a batch and sets the marker only after the batch', () => {
    const collection = buildCollection('User')
    const { engine, events } = createTestEngine([collection])

    engine.writeItems({
      collection,
      marker: 'all',
      items: [
        { key: 1, value: { id: 1, name: 'A' } },
        { key: 2, value: { id: 2, name: 'B' } },
      ],
    })

    expect(engine.hasMarker('all')).toBe(true)
    expect(engine.resolveKeys({ collection })).toEqual([1, 2])
    // One batch-level afterWrite, no per-item ones.
    expect(events.afterWrite).toHaveLength(1)
    expect(events.afterWrite[0]!.operation).toBe('write')
  })

  it('resolveKeys returns [] for an unset marker', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    engine.writeItem({ collection, key: 1, item: { id: 1 } })

    expect(engine.resolveKeys({ collection, marker: 'never' })).toEqual([])
  })

  it('fires afterWrite on single write and delete', () => {
    const collection = buildCollection('User')
    const { engine, events } = createTestEngine([collection])

    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    engine.deleteItem({ collection, key: 1 })

    expect(events.afterWrite.map(e => e.operation)).toEqual(['write', 'delete'])
  })

  it('writes nested relation items into their own collection', () => {
    const userCollection = buildCollection('User', {
      relations: {
        posts: { many: true, to: { Post: { on: {} } } as any },
      },
    })
    const postCollection = buildCollection('Post')
    const { engine } = createTestEngine([userCollection, postCollection])

    engine.writeItem({
      collection: userCollection,
      key: 1,
      item: {
        id: 1,
        name: 'Alice',
        posts: [
          { id: 10, title: 'Hello' },
          { id: 11, title: 'World' },
        ],
      },
    })

    // The relation field is not stored on the parent...
    expect(engine.readItemRaw({ collection: userCollection, key: 1 })).toEqual({ id: 1, name: 'Alice' })
    // ...but the children land in the Post collection.
    expect(engine.readItemRaw({ collection: postCollection, key: 10 })).toEqual({ id: 10, title: 'Hello' })
    expect(engine.readItemRaw({ collection: postCollection, key: 11 })).toEqual({ id: 11, title: 'World' })
  })
})

describe('store-engine: indexes', () => {
  it('resolves keys via an index bucket', () => {
    const collection = buildCollection('Post', {
      indexes: new Map([['authorId', ['authorId']]]),
    })
    const { engine } = createTestEngine([collection])

    engine.writeItem({ collection, key: 1, item: { id: 1, authorId: 'a' } })
    engine.writeItem({ collection, key: 2, item: { id: 2, authorId: 'b' } })
    engine.writeItem({ collection, key: 3, item: { id: 3, authorId: 'a' } })

    expect(engine.resolveKeys({ collection, indexKey: 'authorId', indexValue: 'a' }).sort()).toEqual([1, 3])
    expect(engine.resolveKeys({ collection, indexKey: 'authorId', indexValue: 'b' })).toEqual([2])
  })

  it('removes a key from its index bucket on delete', () => {
    const collection = buildCollection('Post', {
      indexes: new Map([['authorId', ['authorId']]]),
    })
    const { engine } = createTestEngine([collection])

    engine.writeItem({ collection, key: 1, item: { id: 1, authorId: 'a' } })
    engine.deleteItem({ collection, key: 1 })

    expect(engine.resolveKeys({ collection, indexKey: 'authorId', indexValue: 'a' })).toEqual([])
  })
})
