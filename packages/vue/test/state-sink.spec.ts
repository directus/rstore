import type { EngineChangeSet } from '@rstore/core'
import type { ResolvedItemChanges } from '../src/cache/stateSink'
import { describe, expect, it, vi } from 'vitest'
import { createCacheChangeInterestRegistry } from '../src/cache/changeInterest'
import { createCacheStateSink } from '../src/cache/stateSink'

describe('cache state sink', () => {
  it('routes one item through scalar dispatch and promotes multiple items', () => {
    const interest = createCacheChangeInterestRegistry()
    interest.retainItem('Todo', '1')
    interest.retainItem('Todo', '2')
    const aggregateItems: string[] = []
    const aggregateValues: string[] = []
    const flush = vi.fn((changes: EngineChangeSet, values: ResolvedItemChanges) => {
      aggregateItems.push(...changes.items.get('Todo')!)
      aggregateValues.push(...values.get('Todo')!.keys())
    })
    const flushItem = vi.fn()
    const flushIndex = vi.fn()
    const sink = createCacheStateSink({ interest, flush, flushItem, flushIndex })

    expect(sink.begin()).toBe(true)
    sink.recordItem('Todo', '1', { id: 1 })
    sink.commit()

    expect(flushItem).toHaveBeenCalledWith('Todo', '1', { id: 1 }, undefined)
    expect(flush).not.toHaveBeenCalled()

    expect(sink.begin()).toBe(true)
    sink.recordItem('Todo', '1', { id: 1 })
    sink.recordItem('Todo', '2', { id: 2 })
    sink.commit()

    expect(flush).toHaveBeenCalledTimes(1)
    expect(aggregateItems).toEqual(['1', '2'])
    expect(aggregateValues).toEqual(['1', '2'])
  })

  it('routes one exact index dependency without aggregate containers', () => {
    const interest = createCacheChangeInterestRegistry()
    interest.retainIndex('Todo', 'Todo:index:status')
    const flush = vi.fn()
    const flushItem = vi.fn()
    const flushIndex = vi.fn()
    const sink = createCacheStateSink({ interest, flush, flushItem, flushIndex })

    expect(sink.begin()).toBe(true)
    sink.recordIndex('Todo:index:status')
    sink.commit()

    expect(flushIndex).toHaveBeenCalledWith('Todo:index:status')
    expect(flush).not.toHaveBeenCalled()
    expect(flushItem).not.toHaveBeenCalled()
  })
})
