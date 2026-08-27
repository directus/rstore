import { describe, expect, it, vi } from 'vitest'
import { buildCollection, buildLayer, createTestEngine } from './helpers'

describe('store-engine: layers', () => {
  it('overlays a layer on top of the base item with $layer attached', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Alice' } })

    const layer = buildLayer('l1', 'User', { 1: { name: 'Optimistic' } })
    engine.addLayer(layer)

    const resolved = engine.readItemRaw({ collection, key: 1 })
    expect(resolved.name).toBe('Optimistic')
    expect(resolved.id).toBe(1)
    expect(resolved.$layer).toBe(layer)
  })

  it('hides an item deleted by a layer', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Alice' } })

    engine.addLayer(buildLayer('l1', 'User', {}, [1]))

    expect(engine.readItemRaw({ collection, key: 1 })).toBeUndefined()
    expect(engine.resolveKeys({ collection })).not.toContain(1)
  })

  it('reverts to the base item when the layer is removed', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'Alice' } })

    const layer = buildLayer('l1', 'User', { 1: { name: 'Optimistic' } })
    engine.addLayer(layer)
    engine.removeLayer('l1')

    expect(engine.readItemRaw({ collection, key: 1 })).toEqual({ id: 1, name: 'Alice' })
  })

  it('exposes a layer-inserted key in the visible key set', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])

    engine.addLayer(buildLayer('l1', 'User', { 99: { id: 99, name: 'Ghost' } }))

    const keys = engine.resolveKeys({ collection }).map(String)
    expect(keys).toContain('99')
  })

  it('fires layer add and remove callbacks', () => {
    const collection = buildCollection('User')
    const { engine, events } = createTestEngine([collection])

    const layer = buildLayer('l1', 'User', { 1: { id: 1 } })
    engine.addLayer(layer)
    engine.removeLayer('l1')

    expect(events.layerAdd).toHaveLength(1)
    expect(events.layerRemove).toHaveLength(1)
    expect(events.layerAdd[0]!.id).toBe('l1')
  })

  it('reconciles relation indexes for a layer-modified field', () => {
    const collection = buildCollection('Post', {
      indexes: new Map([['authorId', ['authorId']]]),
    })
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1, authorId: 'a' } })

    // Layer moves the post to author 'b'.
    engine.addLayer(buildLayer('l1', 'Post', { 1: { authorId: 'b' } }))

    expect(engine.resolveKeys({ collection, indexKey: 'authorId', indexValue: 'b' }).map(String)).toContain('1')
  })

  it('getLayer returns the registered layer', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    const layer = buildLayer('l1', 'User', { 1: { id: 1 } })
    engine.addLayer(layer)

    expect(engine.getLayer('l1')).toBe(layer)
  })

  it('supports empty collection and layer identities', () => {
    const collection = buildCollection('')
    const { engine } = createTestEngine([collection])
    const layer = buildLayer('', '', { 1: { id: 1 } })

    engine.addLayer(layer)
    expect(engine.getLayer('')).toBe(layer)
    engine.removeLayer('')
    expect(engine.getLayer('')).toBeUndefined()
  })

  it('keeps an existing same-id layer when replacement normalization fails', () => {
    const collection = buildCollection('User', {
      getKey(item) {
        if (item.invalid) {
          throw new Error('invalid layer key')
        }
        return item.id
      },
    })
    const { engine } = createTestEngine([collection])
    const existing = buildLayer('same', 'User', { 1: { id: 1, name: 'existing' } })
    engine.addLayer(existing)

    expect(() => engine.addLayer(buildLayer('same', 'User', { 2: { invalid: true } })))
      .toThrow('invalid layer key')

    expect(engine.getLayer('same')).toBe(existing)
    expect(engine.readItemRaw({ collection, key: 1 })?.name).toBe('existing')
  })

  it('keeps skipped layers out of key forms and observer invalidations', () => {
    const collection = buildCollection('User', { getKey: item => item.id })
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1, name: 'base' } })
    const itemObserver = vi.fn()
    const listObserver = vi.fn()
    engine.observeItem('User', 1, itemObserver)
    engine.observeList('User', listObserver)

    engine.addLayer({
      ...buildLayer('skipped', 'User', { 1: { id: '1', name: 'ignored' } }),
      skip: true,
    })

    expect(engine.resolveKeys({ collection })).toEqual([1])
    expect(engine.readItemRaw({ collection, key: 1 })?.name).toBe('base')
    expect(itemObserver).not.toHaveBeenCalled()
    expect(listObserver).not.toHaveBeenCalled()
  })

  it('restores the base key form after removing a canonical layer key', () => {
    const collection = buildCollection('User', { getKey: item => item.id })
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: '1', item: { name: 'base' } })

    engine.addLayer(buildLayer('canonical', 'User', { 1: { id: 1, name: 'layer' } }))
    expect(engine.resolveKeys({ collection })).toEqual([1])

    engine.removeLayer('canonical')
    expect(engine.resolveKeys({ collection })).toEqual(['1'])
    expect(engine.readItemRaw({ collection, key: 1 })?.name).toBe('base')
  })
})
