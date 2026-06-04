import { describe, expect, it } from 'vitest'
import { buildCollection, createTestEngine } from './helpers'

describe('store-engine: tombstones', () => {
  it('records a tombstone when a delete carries a timestamp', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1 } })

    engine.deleteItem({ collection, key: 1, deletedAt: 100 })

    expect(engine.tombstones.get('User', 1)?.deletedAt).toBe(100)
  })

  it('does not record a tombstone for a delete without a timestamp', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1 } })

    engine.deleteItem({ collection, key: 1 })

    expect(engine.tombstones.get('User', 1)).toBeUndefined()
  })

  it('drops a timestamped write older than the tombstone', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    engine.deleteItem({ collection, key: 1, deletedAt: 100 })

    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Stale' }, fieldTimestamps: { name: 50 } })

    expect(engine.readItemRaw({ collection, key: 1 })).toBeUndefined()
  })

  it('resurrects on a timestamped write newer than the tombstone', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    engine.deleteItem({ collection, key: 1, deletedAt: 100 })

    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Fresh' }, fieldTimestamps: { name: 200 } })

    expect(engine.readItemRaw({ collection, key: 1 })).toEqual({ id: 1, name: 'Fresh' })
    expect(engine.tombstones.get('User', 1)).toBeUndefined()
  })

  it('always resurrects on a write without a timestamp', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1 } })
    engine.deleteItem({ collection, key: 1, deletedAt: 100 })

    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Forced' } })

    expect(engine.readItemRaw({ collection, key: 1 })).toEqual({ id: 1, name: 'Forced' })
  })
})
