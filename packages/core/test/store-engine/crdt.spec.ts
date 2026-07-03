import { describe, expect, it } from 'vitest'
import { buildCollection, createTestEngine } from './helpers'

describe('store-engine: CRDT field merge', () => {
  it('keeps the local field when the incoming timestamp is older', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Local' }, fieldTimestamps: { name: 100 } })
    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Remote' }, fieldTimestamps: { name: 50 } })

    expect(engine.readItemRaw({ collection, key: 1 }).name).toBe('Local')
  })

  it('takes the incoming field when its timestamp is newer', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Local' }, fieldTimestamps: { name: 100 } })
    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Remote' }, fieldTimestamps: { name: 200 } })

    expect(engine.readItemRaw({ collection, key: 1 }).name).toBe('Remote')
  })

  it('records a conflict when timestamps tie but values differ', () => {
    const collection = buildCollection('User')
    const { engine, events } = createTestEngine([collection])

    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Local' }, fieldTimestamps: { name: 100 } })
    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Remote' }, fieldTimestamps: { name: 100 } })

    expect(events.conflicts).toHaveLength(1)
    expect(events.conflicts[0]!.conflicts[0]!.field).toBe('name')
    // Local value kept by default on ties.
    expect(engine.readItemRaw({ collection, key: 1 }).name).toBe('Local')
  })

  it('exposes stored field timestamps', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'A' }, fieldTimestamps: { name: 100 } })

    expect(engine.readFieldTimestamps({ collectionName: 'User', key: 1 })).toEqual({ name: 100 })
  })
})
