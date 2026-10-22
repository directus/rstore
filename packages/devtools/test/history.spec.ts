import { describe, expect, it } from 'vitest'
import { createHistory } from '../src/instrumentation/history'

describe('bounded detached history', () => {
  // Consumer sees recorded values, not later cache edits. A shallow-copy buffer
  // would rewrite earlier evidence and make debugging an operation misleading.
  it('detaches arguments, evicts oldest entries, and never reuses sequence IDs', () => {
    const history = createHistory({ limit: 2, maxBytes: 4096 })
    const item = { title: 'before' }
    history.record({ operation: 'create', phase: 'start', arguments: item })
    item.title = 'after'
    expect(JSON.stringify(history.page().entries)).toContain('before')
    expect(JSON.stringify(history.page().entries)).not.toContain('after')
    history.record({ operation: 'create', phase: 'complete' })
    history.record({ operation: 'delete', phase: 'complete' })
    expect(history.page().entries.map(entry => entry.sequence)).toEqual([2, 3])
    expect(history.page().droppedCount).toBe(1)
    history.clear()
    history.record({ operation: 'update', phase: 'complete' })
    expect(history.page().entries.map(entry => entry.sequence)).toEqual([4])
  })

  it('applies byte limit jointly with count and serves latest page chronologically', () => {
    const history = createHistory({ limit: 10, maxBytes: 512 })
    for (let index = 0; index < 6; index++) {
      history.record({ operation: `event-${index}`, phase: 'event', arguments: 'x'.repeat(120) })
    }
    expect(history.bytes).toBeLessThanOrEqual(512)
    expect(history.page().droppedCount).toBeGreaterThan(0)
    const latest = history.page({ limit: 1 })
    expect(latest.entries.map(entry => entry.operation)).toEqual(['event-5'])
    expect(history.page({ beforeSequence: 6 }).entries.every(entry => entry.sequence < 6)).toBe(true)
  })
})
