import type { EngineChangeInterest, EngineChangeSet, EngineStateChangeSink } from '../../src'
import { describe, expect, it, vi } from 'vitest'
import { createStoreEngine } from '../../src'
import { buildCollection, createTestEngine } from './helpers'

describe('store-engine: observers', () => {
  it('commits compact sink state before generic callbacks and write hooks', () => {
    const collection = buildCollection('User')
    const order: string[] = []
    let buffered: unknown
    const sink: EngineStateChangeSink = {
      begin: () => true,
      wantsItem: (name, key) => name === 'User' && key === '1',
      wantsList: () => false,
      wantsIndex: () => false,
      recordItem: (_name, _key, value) => {
        buffered = value
        order.push('record')
      },
      recordList: vi.fn(),
      recordIndex: vi.fn(),
      recordCollectionReset: vi.fn(),
      commit: () => {
        expect(buffered).toEqual({ id: 1, name: 'A' })
        order.push('sink')
      },
      discard: vi.fn(),
    }
    const engine = createStoreEngine({
      isServer: true,
      callbacks: {
        getCollection: name => name === collection.name ? collection : undefined,
        resolveChildCollection: () => null,
        stateChangeSink: sink,
        onStateChange: () => order.push('state'),
        onWriteCommitted: () => order.push('compact'),
        onAfterWrite: () => order.push('full'),
      },
    })

    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'A' } })

    expect(order).toEqual(['record', 'sink', 'state', 'compact', 'full'])
  })

  it('discards a compact sink buffer after failed validation', () => {
    const collection = buildCollection('User')
    const sink: EngineStateChangeSink = {
      begin: () => true,
      wantsItem: () => true,
      wantsList: () => true,
      wantsIndex: () => true,
      recordItem: vi.fn(),
      recordList: vi.fn(),
      recordIndex: vi.fn(),
      recordCollectionReset: vi.fn(),
      commit: vi.fn(),
      discard: vi.fn(),
    }
    const engine = createStoreEngine({
      isServer: true,
      callbacks: {
        getCollection: name => name === collection.name ? collection : undefined,
        resolveChildCollection: () => null,
        stateChangeSink: sink,
      },
    })

    expect(() => engine.writeItem({ collection, key: 1, item: null as any })).toThrow(TypeError)
    expect(sink.commit).not.toHaveBeenCalled()
    expect(sink.discard).toHaveBeenCalledOnce()
  })

  it('starts a selective compact sink only for matching dependencies', () => {
    const collection = buildCollection('User')
    const interest: EngineChangeInterest = {
      itemKeys: new Map([['User', new Set(['1'])]]),
      lists: new Set(),
      indexes: new Map(),
    }
    const begin = vi.fn(() => true)
    const recordItem = vi.fn()
    const sink: EngineStateChangeSink = {
      getInterest: () => interest,
      begin,
      wantsItem: vi.fn(() => true),
      wantsList: vi.fn(() => true),
      wantsIndex: vi.fn(() => true),
      recordItem,
      recordList: vi.fn(),
      recordIndex: vi.fn(),
      recordCollectionReset: vi.fn(),
      commit: vi.fn(),
      discard: vi.fn(),
    }
    const engine = createStoreEngine({
      isServer: true,
      callbacks: {
        getCollection: name => name === collection.name ? collection : undefined,
        resolveChildCollection: () => null,
        stateChangeSink: sink,
      },
    })

    engine.writeItem({ collection, key: 2, item: { id: 2 } })
    expect(begin).not.toHaveBeenCalled()

    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    expect(begin).toHaveBeenCalledOnce()
    expect(recordItem).toHaveBeenCalledOnce()
    expect(sink.commit).toHaveBeenCalledOnce()
  })

  it('does not apply generic state selector to an independent compact sink', () => {
    const collection = buildCollection('User')
    const recordItem = vi.fn()
    const onStateChange = vi.fn()
    const sink: EngineStateChangeSink = {
      begin: () => true,
      wantsItem: () => true,
      wantsList: () => false,
      wantsIndex: () => false,
      recordItem,
      recordList: vi.fn(),
      recordIndex: vi.fn(),
      recordCollectionReset: vi.fn(),
      commit: vi.fn(),
      discard: vi.fn(),
    }
    const engine = createStoreEngine({
      isServer: true,
      callbacks: {
        getCollection: name => name === collection.name ? collection : undefined,
        resolveChildCollection: () => null,
        getStateChangeInterest: () => ({ itemKeys: new Map(), lists: new Set(), indexes: new Map() }),
        onStateChange,
        stateChangeSink: sink,
      },
    })

    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    expect(recordItem).toHaveBeenCalledOnce()
    expect(sink.commit).toHaveBeenCalledOnce()
    expect(onStateChange).not.toHaveBeenCalled()
  })

  it('scans raw index items with dependency tracking before visitation', () => {
    const post = buildCollection('Post')
    const comment = buildCollection('Comment', {
      indexes: new Map([['postId', ['postId']]]),
    } as any)
    const { engine } = createTestEngine([post, comment])
    engine.writeItems({
      collection: comment,
      items: [
        { key: 1, value: { id: 1, postId: 1 } },
        { key: 2, value: { id: 2, postId: 1 } },
        { key: 3, value: { id: 3, postId: 2 } },
      ],
    })
    const order: string[] = []

    engine.scanItemsRaw(
      { collection: comment, indexKey: 'postId', indexValue: 1 },
      (key, item: any) => {
        order.push(`item:${key}:${item.postId}`)
        return false
      },
      (dependency) => {
        order.push(`dependency:${dependency}`)
      },
    )

    expect(order[0]).toMatch(/^dependency:/)
    expect(order.slice(1)).toEqual(['item:1:1'])

    order.length = 0
    engine.scanItemsRaw(
      { collection: comment, indexKey: 'postId', indexValue: 1 },
      () => {
        order.push('item')
      },
      () => {
        order.push('dependency')
        return false
      },
    )
    expect(order).toEqual(['dependency'])
  })

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
