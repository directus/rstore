import type { EngineChangeSet } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, ref, watchEffect } from 'vue'
import { createSignalRegistry } from '../src/cache/signals'

/** Build one exact immutable change-set payload. */
function changes(options: Partial<EngineChangeSet> = {}): EngineChangeSet {
  return {
    items: new Map(),
    lists: new Set(),
    indexes: new Set(),
    ...options,
  }
}

describe('signal registry', () => {
  it('does not retain an unowned non-reactive read', () => {
    const registry = createSignalRegistry({ isServer: false })

    registry.trackList('User')

    expect(registry.size()).toEqual({ items: 0, lists: 0, indexes: 0 })
  })

  it('retains one list signal until every owning scope stops', () => {
    const registry = createSignalRegistry({ isServer: false })
    const first = effectScope()
    const second = effectScope()
    first.run(() => watchEffect(() => registry.trackList('User'), { flush: 'sync' }))
    second.run(() => watchEffect(() => registry.trackList('User'), { flush: 'sync' }))

    expect(registry.size().lists).toBe(1)
    first.stop()
    expect(registry.size().lists).toBe(1)
    second.stop()
    expect(registry.size().lists).toBe(0)
  })

  it('uses watcher cleanup when no enclosing scope exists', () => {
    const registry = createSignalRegistry({ isServer: false })
    const stop = watchEffect(() => registry.trackIndex('dependency'), { flush: 'sync' })

    expect(registry.size().indexes).toBe(1)
    stop()
    expect(registry.size().indexes).toBe(0)
  })

  it('releases stale index dependencies while scope stays active', () => {
    const registry = createSignalRegistry({ isServer: false })
    const dependency = ref('first')
    const scope = effectScope()
    let stopWatcher!: () => void
    scope.run(() => {
      stopWatcher = watchEffect(() => registry.trackIndex(dependency.value), { flush: 'sync' })
    })

    expect(registry.size().indexes).toBe(1)
    dependency.value = 'second'
    expect(registry.size().indexes).toBe(1)
    stopWatcher()
    expect(registry.size().indexes).toBe(0)
    expect(scope.active).toBe(true)
    scope.stop()
  })

  it('routes exact list and index changes without engine subscriptions', () => {
    const registry = createSignalRegistry({ isServer: false })
    const listReader = vi.fn()
    const indexReader = vi.fn()
    const scope = effectScope()
    scope.run(() => {
      watchEffect(() => {
        registry.trackList('User')
        listReader()
      }, { flush: 'sync' })
      watchEffect(() => {
        registry.trackIndex('wanted')
        indexReader()
      }, { flush: 'sync' })
    })

    registry.flush(changes({ lists: new Set(['Other']), indexes: new Set(['other']) }))
    expect(listReader).toHaveBeenCalledTimes(1)
    expect(indexReader).toHaveBeenCalledTimes(1)

    registry.flush(changes({ lists: new Set(['User']), indexes: new Set(['wanted']) }))
    expect(listReader).toHaveBeenCalledTimes(2)
    expect(indexReader).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('resets sync watchers once even when they replace owned signals', () => {
    const registry = createSignalRegistry({ isServer: false })
    const reader = vi.fn()
    const scope = effectScope()
    scope.run(() => watchEffect(() => {
      registry.trackList('User')
      reader()
    }, { flush: 'sync' }))

    registry.reset()

    expect(reader).toHaveBeenCalledTimes(2)
    expect(registry.size().lists).toBe(1)
    scope.stop()
  })

  it('disposes every remaining signal', () => {
    const registry = createSignalRegistry({ isServer: false })
    const scope = effectScope()
    scope.run(() => {
      watchEffect(() => registry.trackList('User'), { flush: 'sync' })
      watchEffect(() => registry.trackIndex('dependency'), { flush: 'sync' })
    })

    registry.dispose()

    expect(registry.size()).toEqual({ items: 0, lists: 0, indexes: 0 })
    const laterScope = effectScope()
    laterScope.run(() => watchEffect(() => registry.trackList('Other'), { flush: 'sync' }))
    expect(registry.size().lists).toBe(0)
    laterScope.stop()
    scope.stop()
  })

  it('does no work on server', () => {
    const registry = createSignalRegistry({ isServer: true })
    const scope = effectScope()
    scope.run(() => watchEffect(() => registry.trackList('User'), { flush: 'sync' }))

    expect(registry.size()).toEqual({ items: 0, lists: 0, indexes: 0 })
    scope.stop()
  })
})
