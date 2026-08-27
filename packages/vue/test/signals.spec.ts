import type { StoreEngine } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref, watchEffect } from 'vue'
import { createSignalRegistry } from '../src/cache/signals'

/** Build a minimal observer engine and capture each unsubscribe call. */
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
  it('does not subscribe for an unowned non-reactive read', () => {
    const { engine } = fakeEngine()
    const registry = createSignalRegistry({ engine, isServer: false })

    registry.trackItem('User', 1)

    expect(engine.observeItem).not.toHaveBeenCalled()
    expect(registry.size()).toEqual({ items: 0, lists: 0, indexes: 0 })
  })

  it('reuses string and numeric key aliases within one scope', () => {
    const { engine, stops } = fakeEngine()
    const registry = createSignalRegistry({ engine, isServer: false })
    const scope = effectScope()
    scope.run(() => {
      watchEffect(() => registry.trackItem('User', 1), { flush: 'sync' })
      watchEffect(() => registry.trackItem('User', '1'), { flush: 'sync' })
    })

    expect(engine.observeItem).toHaveBeenCalledTimes(1)
    expect(registry.size().items).toBe(1)
    scope.stop()
    expect(stops.item).toHaveBeenCalledTimes(1)
    expect(registry.size().items).toBe(0)
  })

  it('retains a signal until every owning scope stops', () => {
    const { engine, stops } = fakeEngine()
    const registry = createSignalRegistry({ engine, isServer: false })
    const first = effectScope()
    const second = effectScope()
    first.run(() => watchEffect(() => registry.trackList('User'), { flush: 'sync' }))
    second.run(() => watchEffect(() => registry.trackList('User'), { flush: 'sync' }))

    expect(engine.observeList).toHaveBeenCalledTimes(1)
    first.stop()
    expect(stops.list).not.toHaveBeenCalled()
    second.stop()
    expect(stops.list).toHaveBeenCalledTimes(1)
    expect(registry.size().lists).toBe(0)
  })

  it('uses watcher cleanup when a watcher has no enclosing scope', () => {
    const { engine, stops } = fakeEngine()
    const registry = createSignalRegistry({ engine, isServer: false })
    const stop = watchEffect(() => registry.trackIndex('Post', 'authorId', 'a'), { flush: 'sync' })

    expect(engine.observeIndex).toHaveBeenCalledTimes(1)
    stop()
    expect(stops.index).toHaveBeenCalledTimes(1)
    expect(registry.size().indexes).toBe(0)
  })

  it('releases stale dependencies while a watcher scope stays active', () => {
    const { engine, stops } = fakeEngine()
    const registry = createSignalRegistry({ engine, isServer: false })
    const key = ref(1)
    const scope = effectScope()
    let stopWatcher!: () => void
    scope.run(() => {
      stopWatcher = watchEffect(() => registry.trackItem('User', key.value), { flush: 'sync' })
    })

    expect(registry.size().items).toBe(1)
    key.value = 2
    expect(registry.size().items).toBe(1)
    expect(stops.item).toHaveBeenCalledTimes(1)

    stopWatcher()
    expect(registry.size().items).toBe(0)
    expect(stops.item).toHaveBeenCalledTimes(2)
    expect(scope.active).toBe(true)
    scope.stop()
  })

  it('disposes every remaining subscription on cache disposal', () => {
    const { engine, stops } = fakeEngine()
    const registry = createSignalRegistry({ engine, isServer: false })
    const scope = effectScope()
    scope.run(() => {
      watchEffect(() => registry.trackItem('User', 1), { flush: 'sync' })
      watchEffect(() => registry.trackList('User'), { flush: 'sync' })
      watchEffect(() => registry.trackIndex('Post', 'authorId', 'a'), { flush: 'sync' })
    })

    registry.dispose()

    expect(stops.item).toHaveBeenCalledTimes(1)
    expect(stops.list).toHaveBeenCalledTimes(1)
    expect(stops.index).toHaveBeenCalledTimes(1)
    expect(registry.size()).toEqual({ items: 0, lists: 0, indexes: 0 })
    const laterScope = effectScope()
    laterScope.run(() => watchEffect(() => registry.trackItem('User', 2), { flush: 'sync' }))
    expect(engine.observeItem).toHaveBeenCalledTimes(1)
    laterScope.stop()
    scope.stop()
  })

  it('does no work on the server', () => {
    const { engine } = fakeEngine()
    const registry = createSignalRegistry({ engine, isServer: true })
    const scope = effectScope()
    scope.run(() => watchEffect(() => registry.trackItem('User', 1), { flush: 'sync' }))

    expect(engine.observeItem).not.toHaveBeenCalled()
    expect(registry.size()).toEqual({ items: 0, lists: 0, indexes: 0 })
    scope.stop()
  })
})
