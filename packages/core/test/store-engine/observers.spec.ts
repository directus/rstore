import type { EngineChangeInterest, EngineChangeSet } from '../../src'
import { describe, expect, it, vi } from 'vitest'
import { createStoreEngine } from '../../src'
import { buildCollection, createTestEngine } from './helpers'

describe('store-engine: observers', () => {
  it('notifies an item observer on write', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    const cb = vi.fn()
    engine.observeItem('User', 1, cb)

    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'A' } })

    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('publishes committed state before hooks and final observers', () => {
    const collection = buildCollection('User')
    const order: string[] = []
    const engine = createStoreEngine({
      isServer: true,
      callbacks: {
        getCollection: name => name === collection.name ? collection : undefined,
        resolveChildCollection: () => null,
        onStateChange(changes) {
          expect(engine.readItemRaw({ collection, key: 1 })).toEqual({ id: 1, name: 'A' })
          expect(changes.items.get('User')).toEqual(new Set(['1']))
          order.push('state')
        },
        onAfterWrite: () => order.push('hook'),
        onObserverFlush: () => order.push('flush'),
      },
    })
    engine.observeItem('User', 1, () => order.push('observer'))

    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'A' } })

    expect(order).toEqual(['state', 'hook', 'flush', 'observer'])
  })

  it('publishes stable operation-local change sets during one queue flush', () => {
    const collection = buildCollection('User')
    const operations: EngineChangeSet[] = []
    const engine = createStoreEngine({
      isServer: true,
      callbacks: {
        getCollection: name => name === collection.name ? collection : undefined,
        resolveChildCollection: () => null,
        onStateChange: changes => operations.push(changes),
      },
    })
    engine.pause()
    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    engine.writeItem({ collection, key: 2, item: { id: 2 } })

    engine.resume()

    expect(operations).toHaveLength(2)
    expect(operations[0]).not.toBe(operations[1])
    expect(operations[0]!.items.get('User')).toEqual(new Set(['1']))
    expect(operations[1]!.items.get('User')).toEqual(new Set(['2']))
  })

  it('filters immediate state changes without filtering direct observers', () => {
    const collection = buildCollection('User')
    const itemKeys = new Map<string, true | ReadonlySet<string>>([
      ['User', new Set(['1'])],
    ])
    const interest: EngineChangeInterest = {
      itemKeys,
      lists: new Set(),
      indexes: new Map(),
    }
    const operations: EngineChangeSet[] = []
    const otherObserver = vi.fn()
    const engine = createStoreEngine({
      isServer: true,
      callbacks: {
        getCollection: name => name === collection.name ? collection : undefined,
        resolveChildCollection: () => null,
        getStateChangeInterest: () => interest,
        onStateChange: changes => operations.push(changes),
      },
    })
    engine.observeItem('User', 2, otherObserver)

    engine.writeItem({ collection, key: 2, item: { id: 2 } })
    expect(operations).toHaveLength(0)
    expect(otherObserver).toHaveBeenCalledTimes(1)

    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    expect(operations).toHaveLength(1)
    expect(operations[0]!.items.get('User')).toEqual(new Set(['1']))
  })

  it('reads state-change interests for every queued operation', () => {
    const collection = buildCollection('User')
    const itemKeys = new Map<string, true | ReadonlySet<string>>([
      ['User', new Set(['1'])],
    ])
    const operations: EngineChangeSet[] = []
    const engine = createStoreEngine({
      isServer: true,
      callbacks: {
        getCollection: name => name === collection.name ? collection : undefined,
        resolveChildCollection: () => null,
        getStateChangeInterest: () => ({ itemKeys, lists: new Set(), indexes: new Map() }),
        onStateChange: changes => operations.push(changes),
      },
    })
    engine.pause()
    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    engine.writeItem({ collection, key: 2, item: { id: 2 } })
    itemKeys.set('User', new Set(['2']))

    engine.resume()

    expect(operations).toHaveLength(1)
    expect(operations[0]!.items.get('User')).toEqual(new Set(['2']))
  })

  it('a field update does NOT re-run the list observer (perf win)', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'A' } })

    const listCb = vi.fn()
    const itemCb = vi.fn()
    engine.observeList('User', listCb)
    engine.observeItem('User', 1, itemCb)

    // Update an existing item's field.
    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'B' } })

    expect(itemCb).toHaveBeenCalledTimes(1)
    expect(listCb).not.toHaveBeenCalled()
  })

  it('an insert re-runs both item and list observers', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    const listCb = vi.fn()
    engine.observeList('User', listCb)
    const itemCb = vi.fn()
    engine.observeItem('User', 2, itemCb)

    engine.writeItem({ collection, key: 2, item: { id: 2 } })

    expect(itemCb).toHaveBeenCalledTimes(1)
    expect(listCb).toHaveBeenCalledTimes(1)
  })

  it('a delete re-runs both item and list observers', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1 } })

    const listCb = vi.fn()
    engine.observeList('User', listCb)
    const itemCb = vi.fn()
    engine.observeItem('User', 1, itemCb)

    engine.deleteItem({ collection, key: 1 })

    expect(itemCb).toHaveBeenCalledTimes(1)
    expect(listCb).toHaveBeenCalledTimes(1)
  })

  it('a batch write fires each item observer once and the list once', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    const listCb = vi.fn()
    engine.observeList('User', listCb)
    const item1 = vi.fn()
    const item2 = vi.fn()
    engine.observeItem('User', 1, item1)
    engine.observeItem('User', 2, item2)

    engine.writeItems({
      collection,
      items: [
        { key: 1, value: { id: 1 } },
        { key: 2, value: { id: 2 } },
      ],
    })

    expect(item1).toHaveBeenCalledTimes(1)
    expect(item2).toHaveBeenCalledTimes(1)
    expect(listCb).toHaveBeenCalledTimes(1)
  })

  it('notifies an index observer when a relation bucket changes', () => {
    const collection = buildCollection('Post', {
      indexes: new Map([['authorId', ['authorId']]]),
    })
    const { engine } = createTestEngine([collection])

    const indexCb = vi.fn()
    engine.observeIndex('Post', 'authorId', 'a', indexCb)

    engine.writeItem({ collection, key: 1, item: { id: 1, authorId: 'a' } })

    expect(indexCb).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribe', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    const cb = vi.fn()
    const unsubscribe = engine.observeItem('User', 1, cb)

    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    unsubscribe()
    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'B' } })

    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('isolates a throwing observer from the others', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    const bad = vi.fn(() => {
      throw new Error('boom')
    })
    const good = vi.fn()
    engine.observeItem('User', 1, bad)
    engine.observeItem('User', 1, good)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    engine.writeItem({ collection, key: 1, item: { id: 1 } })

    expect(good).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('releases observers on dispose and rejects new subscriptions', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    const beforeDispose = vi.fn()
    const afterDispose = vi.fn()
    engine.observeItem('User', 1, beforeDispose)

    engine.dispose()
    engine.observeItem('User', 1, afterDispose)
    engine.writeItem({ collection, key: 1, item: { id: 1 } })

    expect(beforeDispose).not.toHaveBeenCalled()
    expect(afterDispose).not.toHaveBeenCalled()
  })
})
