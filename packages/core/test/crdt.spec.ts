import { describe, expect, it } from 'vitest'
import { applyTextChanges, createFieldTimestamps, diffFields, diffText, fieldValuesEqual, mergeItemFields, mergeText, touchFields } from '../src/crdt'

describe('mergeItemFields', () => {
  it('should keep local values when local timestamps are newer', () => {
    const local = { title: 'Local Title', description: 'Local Desc' }
    const remote = { title: 'Remote Title', description: 'Remote Desc' }
    const localTs = { title: 200, description: 200 }
    const remoteTs = { title: 100, description: 100 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.merged.title).toBe('Local Title')
    expect(result.merged.description).toBe('Local Desc')
    expect(result.conflicts).toHaveLength(0)
  })

  it('should accept remote values when remote timestamps are newer', () => {
    const local = { title: 'Local Title', description: 'Local Desc' }
    const remote = { title: 'Remote Title', description: 'Remote Desc' }
    const localTs = { title: 100, description: 100 }
    const remoteTs = { title: 200, description: 200 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.merged.title).toBe('Remote Title')
    expect(result.merged.description).toBe('Remote Desc')
    expect(result.conflicts).toHaveLength(0)
  })

  it('should merge field-by-field when timestamps differ per field', () => {
    const local = { title: 'Local Title', description: 'Local Desc', status: 'draft' }
    const remote = { title: 'Remote Title', description: 'Remote Desc', status: 'published' }
    const localTs = { title: 200, description: 100, status: 100 }
    const remoteTs = { title: 100, description: 200, status: 200 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.merged.title).toBe('Local Title')
    expect(result.merged.description).toBe('Remote Desc')
    expect(result.merged.status).toBe('published')
    expect(result.conflicts).toHaveLength(0)
  })

  it('should detect conflicts when timestamps are equal but values differ', () => {
    const local = { title: 'Local Title', description: 'Same Desc' }
    const remote = { title: 'Remote Title', description: 'Same Desc' }
    const localTs = { title: 100, description: 100 }
    const remoteTs = { title: 100, description: 100 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]!.field).toBe('title')
    expect(result.conflicts[0]!.localValue).toBe('Local Title')
    expect(result.conflicts[0]!.remoteValue).toBe('Remote Title')
    // Local value is kept by default
    expect(result.merged.title).toBe('Local Title')
    // No conflict on description since values are equal
    expect(result.merged.description).toBe('Same Desc')
  })

  it('should not report conflict when timestamps are equal and values are the same', () => {
    const local = { title: 'Same', count: 42 }
    const remote = { title: 'Same', count: 42 }
    const localTs = { title: 100, count: 100 }
    const remoteTs = { title: 100, count: 100 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.conflicts).toHaveLength(0)
    expect(result.merged.title).toBe('Same')
    expect(result.merged.count).toBe(42)
  })

  it('should handle fields present only in local', () => {
    const local: Record<string, any> = { title: 'Title', extra: 'local-only' }
    const remote: Record<string, any> = { title: 'Title' }
    const localTs = { title: 100, extra: 100 }
    const remoteTs = { title: 100 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.merged.extra).toBe('local-only')
    expect(result.mergedTimestamps.extra).toBe(100)
  })

  it('should handle fields present only in remote', () => {
    const local: Record<string, any> = { title: 'Title' }
    const remote: Record<string, any> = { title: 'Title', newField: 'remote-only' }
    const localTs = { title: 100 }
    const remoteTs = { title: 100, newField: 200 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.merged.newField).toBe('remote-only')
    expect(result.mergedTimestamps.newField).toBe(200)
  })

  it('should handle missing timestamps (defaulting to 0)', () => {
    const local = { title: 'Local', description: 'Local' }
    const remote = { title: 'Remote', description: 'Remote' }
    const localTs = {} // no timestamps
    const remoteTs = { title: 100, description: 100 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    // Remote wins since local timestamps default to 0
    expect(result.merged.title).toBe('Remote')
    expect(result.merged.description).toBe('Remote')
  })

  it('should store the correct merged timestamps', () => {
    const local = { a: 1, b: 2 }
    const remote = { a: 10, b: 20 }
    const localTs = { a: 300, b: 100 }
    const remoteTs = { a: 200, b: 400 }

    const result = mergeItemFields(local, remote, localTs, remoteTs)

    expect(result.mergedTimestamps.a).toBe(300) // local won
    expect(result.mergedTimestamps.b).toBe(400) // remote won
  })
})

describe('createFieldTimestamps', () => {
  it('should create timestamps for all fields', () => {
    const data = { title: 'Test', count: 5, active: true }
    const now = Date.now()
    const ts = createFieldTimestamps(data, now)

    expect(ts.title).toBe(now)
    expect(ts.count).toBe(now)
    expect(ts.active).toBe(now)
  })

  it('should default to Date.now()', () => {
    const before = Date.now()
    const ts = createFieldTimestamps({ x: 1 })
    const after = Date.now()

    expect(ts.x).toBeGreaterThanOrEqual(before)
    expect(ts.x).toBeLessThanOrEqual(after)
  })

  it('should return empty object for empty input', () => {
    const ts = createFieldTimestamps({})
    expect(Object.keys(ts)).toHaveLength(0)
  })
})

describe('touchFields', () => {
  it('should update specified fields', () => {
    const ts = { a: 100, b: 100, c: 100 }
    const result = touchFields(ts, ['a', 'c'], 200)

    expect(result.a).toBe(200)
    expect(result.b).toBe(100)
    expect(result.c).toBe(200)
  })

  it('should not mutate the original timestamps', () => {
    const ts = { a: 100 }
    const result = touchFields(ts, ['a'], 200)

    expect(ts.a).toBe(100)
    expect(result.a).toBe(200)
  })

  it('should add new fields', () => {
    const ts = { a: 100 }
    const result = touchFields(ts, ['b'], 200)

    expect(result.a).toBe(100)
    expect(result.b).toBe(200)
  })
})

describe('diffFields', () => {
  it('should return changed fields', () => {
    const oldObj = { title: 'Old', description: 'Same', count: 1 }
    const newObj = { title: 'New', description: 'Same', count: 2 }

    const changed = diffFields(oldObj, newObj)

    expect(changed).toContain('title')
    expect(changed).toContain('count')
    expect(changed).not.toContain('description')
  })

  it('should detect added fields', () => {
    const oldObj = { a: 1 }
    const newObj = { a: 1, b: 2 }

    const changed = diffFields(oldObj, newObj)

    expect(changed).toContain('b')
    expect(changed).not.toContain('a')
  })

  it('should detect removed fields', () => {
    const oldObj = { a: 1, b: 2 }
    const newObj = { a: 1 }

    const changed = diffFields(oldObj, newObj)

    expect(changed).toContain('b')
  })

  it('should return empty array for identical objects', () => {
    const obj = { a: 1, b: 'hello' }
    const changed = diffFields(obj, { ...obj })

    expect(changed).toHaveLength(0)
  })

  it('should compare arrays by JSON equality', () => {
    const oldObj = { tags: ['a', 'b'] }
    const newObj = { tags: ['a', 'b'] }

    expect(diffFields(oldObj, newObj)).toHaveLength(0)

    const newObj2 = { tags: ['a', 'c'] }
    expect(diffFields(oldObj, newObj2)).toContain('tags')
  })
})

describe('fieldValuesEqual', () => {
  it('should handle primitives', () => {
    expect(fieldValuesEqual(1, 1)).toBe(true)
    expect(fieldValuesEqual(1, 2)).toBe(false)
    expect(fieldValuesEqual('a', 'a')).toBe(true)
    expect(fieldValuesEqual('a', 'b')).toBe(false)
    expect(fieldValuesEqual(true, true)).toBe(true)
    expect(fieldValuesEqual(true, false)).toBe(false)
  })

  it('should handle null/undefined', () => {
    expect(fieldValuesEqual(null, null)).toBe(true)
    expect(fieldValuesEqual(undefined, undefined)).toBe(true)
    expect(fieldValuesEqual(null, undefined)).toBe(true)
    expect(fieldValuesEqual(null, 0)).toBe(false)
    expect(fieldValuesEqual(undefined, '')).toBe(false)
  })

  it('should compare objects by JSON', () => {
    expect(fieldValuesEqual({ a: 1 }, { a: 1 })).toBe(true)
    expect(fieldValuesEqual({ a: 1 }, { a: 2 })).toBe(false)
    expect(fieldValuesEqual([1, 2], [1, 2])).toBe(true)
    expect(fieldValuesEqual([1, 2], [2, 1])).toBe(false)
  })

  it('should handle type mismatches', () => {
    expect(fieldValuesEqual(1, '1')).toBe(false)
    expect(fieldValuesEqual(0, false)).toBe(false)
  })
})

describe('diffText', () => {
  it('should create changes that reproduce the target string', () => {
    const source = 'Hello world'
    const target = 'Hello brave new world!'

    const changes = diffText(source, target)

    expect(applyTextChanges(source, changes)).toBe(target)
  })

  it('should collapse adjacent inserts and deletes into replace operations', () => {
    const source = 'abcd'
    const target = 'abXYd'

    expect(diffText(source, target)).toEqual([
      {
        index: 2,
        deleteCount: 1,
        insertText: 'XY',
      },
    ])
  })
})

describe('mergeText', () => {
  it('should merge non-overlapping concurrent edits', () => {
    const result = mergeText(
      'Hello world',
      'Hello brave world',
      'Hello world!',
    )

    expect(result.conflicts).toHaveLength(0)
    expect(result.merged).toBe('Hello brave world!')
  })

  it('should keep deterministic ordering for concurrent inserts at the same position', () => {
    const result = mergeText(
      'Hello world',
      'Hello brave world',
      'Hello dear world',
    )

    expect(result.conflicts).toHaveLength(0)
    expect(result.merged).toBe('Hello brave dear world')
  })

  it('should report overlapping replacements as conflicts', () => {
    const result = mergeText(
      'Hello world',
      'Hello planet',
      'Hello there',
    )

    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      index: 6,
      localChange: {
        index: 6,
      },
      remoteChange: {
        index: 6,
      },
    })
  })
})
