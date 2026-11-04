import type { EngineStateChangeSink } from '../../src'
import { describe, expect, it, vi } from 'vitest'
import { createStoreEngine } from '../../src'
import { buildCollection, buildLayer } from './helpers'

/** Create an engine whose compact sink counts state publications. */
function createCountingEngine() {
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
  return { engine, collection, sink }
}

describe('store-engine: garbage collection', () => {
  it('evicts several keys in one state publication', () => {
    const { engine, collection, sink } = createCountingEngine()
    for (const id of [1, 2, 3, 4]) {
      engine.writeItem({ collection, key: id, item: { id } })
    }
    vi.mocked(sink.commit).mockClear()

    const removed = engine.garbageCollectKeys(collection, [1, 2, 3])

    expect(removed).toEqual([1, 2, 3])
    expect(sink.commit).toHaveBeenCalledOnce()
    expect(engine.readItemRaw({ collection, key: 1 })).toBeUndefined()
    expect(engine.readItemRaw({ collection, key: 3 })).toBeUndefined()
    expect(engine.readItemRaw({ collection, key: 4 })).toEqual({ id: 4 })
  })

  it('skips layered and missing keys and returns only evicted keys', () => {
    const { engine, collection, sink } = createCountingEngine()
    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Base' } })
    engine.writeItem({ collection, key: 2, item: { id: 2 } })
    engine.addLayer(buildLayer('l1', 'User', { 1: { name: 'Optimistic' } }))
    vi.mocked(sink.commit).mockClear()

    expect(engine.garbageCollectKeys(collection, [1, 2, 99])).toEqual([2])
    expect(engine.readItemRaw({ collection, key: 1 })?.name).toBe('Optimistic')
    expect(sink.commit).toHaveBeenCalledOnce()

    expect(engine.garbageCollectKeys(collection, [1, 99])).toEqual([])
    expect(sink.commit).toHaveBeenCalledOnce()
  })
})
