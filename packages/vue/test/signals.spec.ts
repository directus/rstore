import type { StoreEngine } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'
import { createSignalRegistry } from '../src/cache/signals'

/**
 * Build a fake engine that records observer subscriptions + unsubscriptions,
 * so we can assert the registry frees them. Only the three `observe*` methods
 * the registry touches are implemented.
 */
function fakeEngine() {
  const stops = { item: vi.fn(), list: vi.fn(), index: vi.fn() }
  const engine = {
    observeItem: vi.fn(() => stops.item),
    observeList: vi.fn(() => stops.list),
    observeIndex: vi.fn(() => stops.index),
  } as unknown as StoreEngine
  return { engine, stops }
}

describe('signal registry', () => {
  it('subscribes lazily on first track and reuses the signal by key', () => {
    const { engine } = fakeEngine()
    const reg = createSignalRegistry({ engine, isServer: false })

    reg.trackItem('User', 1)
    reg.trackItem('User', 1)

    expect(engine.observeItem).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes and frees the item signal on dropItem', () => {
    const { engine, stops } = fakeEngine()
    const reg = createSignalRegistry({ engine, isServer: false })

    reg.trackItem('User', 1)
    reg.dropItem('User', 1)

    expect(stops.item).toHaveBeenCalledTimes(1)
    expect(reg.size().items).toBe(0)
    // Tracking again creates a fresh subscription (the old signal was freed).
    reg.trackItem('User', 1)
    expect(engine.observeItem).toHaveBeenCalledTimes(2)
  })

  it('unsubscribes the index bucket on dropIndexBucket', () => {
    const { engine, stops } = fakeEngine()
    const reg = createSignalRegistry({ engine, isServer: false })

    reg.trackIndex('Comment', 'postId', 'p1')
    reg.dropIndexBucket('Comment', 'postId', 'p1')

    expect(stops.index).toHaveBeenCalledTimes(1)
    expect(reg.size().indexes).toBe(0)
  })

  it('disposes every subscription and resets counts', () => {
    const { engine, stops } = fakeEngine()
    const reg = createSignalRegistry({ engine, isServer: false })

    reg.trackItem('User', 1)
    reg.trackList('User')
    reg.trackIndex('Comment', 'postId', 'p1')
    reg.dispose()

    expect(stops.item).toHaveBeenCalledTimes(1)
    expect(stops.list).toHaveBeenCalledTimes(1)
    expect(stops.index).toHaveBeenCalledTimes(1)
    expect(reg.size()).toEqual({ items: 0, lists: 0, indexes: 0 })
  })

  it('reports tracked signal counts via size()', () => {
    const { engine } = fakeEngine()
    const reg = createSignalRegistry({ engine, isServer: false })

    reg.trackItem('User', 1)
    reg.trackItem('User', 2)
    reg.trackList('User')
    reg.trackIndex('Comment', 'postId', 'p1')

    expect(reg.size()).toEqual({ items: 2, lists: 1, indexes: 1 })
    reg.dropItem('User', 1)
    expect(reg.size().items).toBe(1)
  })

  it('is a no-op on the server', () => {
    const { engine } = fakeEngine()
    const reg = createSignalRegistry({ engine, isServer: true })

    reg.trackItem('User', 1)
    reg.trackList('User')
    reg.trackIndex('Comment', 'postId', 'p1')

    expect(engine.observeItem).not.toHaveBeenCalled()
    expect(reg.size()).toEqual({ items: 0, lists: 0, indexes: 0 })
  })
})
