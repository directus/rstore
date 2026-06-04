import { describe, expect, it, vi } from 'vitest'
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
})
