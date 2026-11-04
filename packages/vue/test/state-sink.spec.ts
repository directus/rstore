import type { EngineChangeSet } from '@rstore/core'
import type { ResolvedItemChanges } from '../src/cache/stateSink'
import { describe, expect, it, vi } from 'vitest'
import { createCacheChangeInterestRegistry } from '../src/cache/changeInterest'
import { createCacheStateSink } from '../src/cache/stateSink'
import { synchronizeBridgeIndex } from '../src/cache/stateSinkIndex'
import { synchronizeBridgeItem } from '../src/cache/stateSinkItem'

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

  it('runs later item sinks and preserves a single failure identity', () => {
    const failure = new Error('versions failed')
    const calls: string[] = []
    const ctx = {
      versions: {
        flushItem() {
          calls.push('versions')
          throw failure
        },
      },
      signals: {
        flushItem() {
          calls.push('signals')
        },
      },
      itemCells: {
        flushItem() {
          calls.push('itemCells')
        },
      },
      wrappedItems: {
        deleteBase() {
          calls.push('wrappedItems')
        },
      },
    }

    let caught: unknown
    try {
      synchronizeBridgeItem(ctx as any, 'todos', '1', { id: '1' })
    }
    catch (error) {
      caught = error
    }

    expect(calls).toEqual(['versions', 'signals', 'itemCells'])
    expect(caught).toBe(failure)
  })

  it('runs later index sinks and flattens aggregate callback failures', () => {
    const first = new Error('invalidate failed')
    const second = new Error('nested reactive failure')
    const calls: string[] = []
    const ctx = {
      indexResultCache: {
        invalidate() {
          calls.push('indexes')
          throw new AggregateError([first, second], 'index invalidation failed')
        },
      },
      versions: {
        flushIndex() {
          calls.push('versions')
        },
      },
      signals: {
        flushIndex() {
          calls.push('signals')
        },
      },
    }

    let caught: unknown
    try {
      synchronizeBridgeIndex(ctx as any, 'todos:status')
    }
    catch (error) {
      caught = error
    }

    expect(calls).toEqual(['indexes', 'versions', 'signals'])
    expect(caught).toBeInstanceOf(AggregateError)
    expect((caught as AggregateError).errors).toEqual([first, second])
  })
})
