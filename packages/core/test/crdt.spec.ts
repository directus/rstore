import { describe, expect, it } from 'vitest'
import { applyTextChanges, createFieldTimestamps, diffFields, diffText, fieldValuesEqual, mergeItemFields, mergeText, rebaseTextPosition, rebaseTextRange, touchFields } from '../src/crdt'

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

  it('should default to a fresh HLC timestamp string', () => {
    const ts = createFieldTimestamps({ x: 1 })
    expect(typeof ts.x).toBe('string')
    // HLC string form: "{physicalHex}:{logicalHex}:{nodeId}" — two colons.
    const colons = (ts.x as string).split(':').length - 1
    expect(colons).toBeGreaterThanOrEqual(2)
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

  it('should treat NaN as equal to NaN', () => {
    expect(fieldValuesEqual(Number.NaN, Number.NaN)).toBe(true)
    expect(fieldValuesEqual(Number.NaN, 0)).toBe(false)
  })

  it('should be key-order independent for objects', () => {
    expect(fieldValuesEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(fieldValuesEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false)
  })

  it('should compare Date by time value', () => {
    expect(fieldValuesEqual(new Date(100), new Date(100))).toBe(true)
    expect(fieldValuesEqual(new Date(100), new Date(200))).toBe(false)
    expect(fieldValuesEqual(new Date('invalid'), new Date('invalid'))).toBe(true)
  })

  it('should compare Map by entries', () => {
    expect(fieldValuesEqual(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true)
    expect(fieldValuesEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false)
    expect(fieldValuesEqual(new Map(), new Map([['a', 1]]))).toBe(false)
  })

  it('should compare Set by members', () => {
    expect(fieldValuesEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true)
    expect(fieldValuesEqual(new Set([1, 2]), new Set([1, 3]))).toBe(false)
  })

  it('should not confuse different prototypes', () => {
    expect(fieldValuesEqual(new Date(0), { getTime: () => 0 } as any)).toBe(false)
    expect(fieldValuesEqual(new Map([['a', 1]]), [['a', 1]] as any)).toBe(false)
  })

  it('should tolerate cyclic references without throwing', () => {
    const a: any = {}
    const b: any = {}
    a.self = a
    b.self = b
    expect(() => fieldValuesEqual(a, b)).not.toThrow()
  })

  it('should consider array order significant', () => {
    expect(fieldValuesEqual([1, 2, 3], [3, 2, 1])).toBe(false)
  })

  it('should distinguish arrays from objects with numeric keys', () => {
    expect(fieldValuesEqual([1, 2], { 0: 1, 1: 2, length: 2 } as any)).toBe(false)
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
    // Without HLC timestamps mergeText falls back to a stable but
    // arbitrary lexicographic tiebreak.
    expect(result.merged).toBe('Hello brave dear world')
  })

  it('should order concurrent inserts at the same position by HLC when provided', () => {
    // Local clock fires later than remote — remote's text should come first
    // because its HLC is smaller (it was generated earlier in causal time).
    const earlierThanLocal = '000000000001:0000:remote'
    const localStamp = '000000000002:0000:local'

    const result = mergeText(
      'Hello world',
      'Hello brave world',
      'Hello dear world',
      { localTimestamp: localStamp, remoteTimestamp: earlierThanLocal },
    )

    expect(result.conflicts).toHaveLength(0)
    // 'dear' was generated earlier so it appears before 'brave'.
    expect(result.merged).toBe('Hello dear brave world')
  })

  it('should produce the same merge regardless of which side is "local"', () => {
    // Commutativity: peer A and peer B must converge to the same string.
    const stampX = '000000000001:0000:x'
    const stampY = '000000000002:0000:y'

    const fromA = mergeText(
      'Hello world',
      'Hello brave world', // A's local edit
      'Hello dear world', // A sees B as remote
      { localTimestamp: stampX, remoteTimestamp: stampY },
    )

    const fromB = mergeText(
      'Hello world',
      'Hello dear world', // B's local edit
      'Hello brave world', // B sees A as remote
      { localTimestamp: stampY, remoteTimestamp: stampX },
    )

    expect(fromA.merged).toBe(fromB.merged)
  })

  it('should fall back to alphabetic ordering when only one timestamp is provided', () => {
    const result = mergeText(
      'Hello world',
      'Hello brave world',
      'Hello dear world',
      { localTimestamp: '000000000001:0000:x' },
    )

    // Missing remoteTimestamp → no causal info → use the deterministic fallback.
    expect(result.merged).toBe('Hello brave dear world')
  })

  it('should use nodeId as a deterministic tiebreaker for identical HLC physical+logical', () => {
    // Same physical and logical components — only nodeId differs.
    const stampA = '000000000001:0000:alpha'
    const stampB = '000000000001:0000:beta'

    const result = mergeText(
      'Hello world',
      'Hello brave world',
      'Hello dear world',
      { localTimestamp: stampA, remoteTimestamp: stampB },
    )

    expect(result.conflicts).toHaveLength(0)
    // 'alpha' < 'beta' so local's "brave" comes first.
    expect(result.merged).toBe('Hello brave dear world')
  })

  it('should report overlapping replacements as conflicts', () => {
    const result = mergeText(
      'Hello world',
      'Hello planet',
      'Hello there',
    )

    expect(result.conflicts.length).toBeGreaterThanOrEqual(1)
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

  it('should preserve non-conflicting remote edits after a conflict', () => {
    const result = mergeText('abcdefgh', 'aXdefgh', 'aYdefgh!')

    expect(result.conflicts.length).toBeGreaterThan(0)
    // The trailing '!' from remote is non-conflicting and should survive
    // despite the earlier conflict at index 1.
    expect(result.merged.endsWith('!')).toBe(true)
  })

  it('should preserve non-conflicting local edits after a conflict', () => {
    const result = mergeText('abcdefgh', '!aXdefgh', 'aYdefgh')

    expect(result.conflicts.length).toBeGreaterThan(0)
    expect(result.merged.startsWith('!')).toBe(true)
  })

  describe('edge cases', () => {
    it('should produce identical merge regardless of which side is local (no HLC)', () => {
      // Without HLC the alphabetic fallback must still be commutative.
      const ab = mergeText('Hello world', 'Hello brave world', 'Hello dear world')
      const ba = mergeText('Hello world', 'Hello dear world', 'Hello brave world')
      expect(ab.merged).toBe(ba.merged)
    })

    it('should cleanly merge delete-and-insert at the same boundary', () => {
      // Local removes "bc" at position 1, remote inserts "X" at position 1.
      // These don't overlap in the literal range sense — the insert is
      // applied first, then the deletion takes effect against the original
      // characters. The merge should be deterministic with no conflict.
      const result = mergeText('abcde', 'ade', 'aXbcde')
      expect(result.conflicts).toHaveLength(0)
      expect(result.merged).toBe('aXde')
    })

    it('should produce the same result regardless of side for delete-and-insert at boundary', () => {
      const ab = mergeText('abcde', 'ade', 'aXbcde')
      const ba = mergeText('abcde', 'aXbcde', 'ade')
      expect(ab.merged).toBe(ba.merged)
    })

    it('should not corrupt surrogate pairs when merging emoji edits', () => {
      // 🌟 is a single user-perceived character but two UTF-16 code units.
      // Inserting before/after it must keep the pair intact.
      const base = 'Hello 🌟 world'
      const local = 'Hello brave 🌟 world'
      const remote = 'Hello 🌟 brave world'

      const result = mergeText(base, local, remote)
      // 🌟 should still be present and intact in the merged output.
      expect(result.merged.includes('🌟')).toBe(true)
      // No lone surrogates — `[...str]` iterates by code point and would
      // expose any orphans as their own entries.
      const codePoints = [...result.merged]
      expect(codePoints.includes('🌟')).toBe(true)
    })

    it('should treat empty-base inserts on both sides as concurrent inserts at 0', () => {
      const result = mergeText('', 'abc', 'def', {
        localTimestamp: '000000000001:0000:a',
        remoteTimestamp: '000000000002:0000:b',
      })
      expect(result.conflicts).toHaveLength(0)
      // Earlier HLC ('a') comes first.
      expect(result.merged).toBe('abcdef')
    })

    it('should pass through unchanged when local equals remote', () => {
      const result = mergeText('hello', 'world', 'world')
      expect(result.merged).toBe('world')
      expect(result.conflicts).toHaveLength(0)
    })

    it('should remain commutative across three peers (pairwise merges converge)', () => {
      // Three peers all start from the same base and each inserts at the
      // same position. Any order of pairwise merges must agree once all
      // three timestamps are known.
      const base = 'XY'
      const a = 'XaY'
      const b = 'XbY'
      const c = 'XcY'
      const tsA = '000000000001:0000:a'
      const tsB = '000000000002:0000:b'
      const tsC = '000000000003:0000:c'

      const ab = mergeText(base, a, b, { localTimestamp: tsA, remoteTimestamp: tsB })
      const abc = mergeText(base, ab.merged, c, { localTimestamp: tsB, remoteTimestamp: tsC })

      const ba = mergeText(base, b, a, { localTimestamp: tsB, remoteTimestamp: tsA })
      const bac = mergeText(base, ba.merged, c, { localTimestamp: tsB, remoteTimestamp: tsC })

      // We don't lock down the exact ordering rule across three peers
      // (the pairwise interface can't fully express it) — but commutativity
      // of the *first* merge must hold.
      expect(ab.merged).toBe(ba.merged)
      // And both 3-way combinations should at least contain all three letters.
      for (const merged of [abc.merged, bac.merged]) {
        expect(merged).toContain('a')
        expect(merged).toContain('b')
        expect(merged).toContain('c')
      }
    })

    it('should handle very long text inputs without corrupting structure', () => {
      const base = 'x'.repeat(2000)
      const local = `prefix-${base}`
      const remote = `${base}-suffix`
      const result = mergeText(base, local, remote)
      expect(result.conflicts).toHaveLength(0)
      expect(result.merged.startsWith('prefix-')).toBe(true)
      expect(result.merged.endsWith('-suffix')).toBe(true)
      // The middle x's are preserved exactly — no doubling, no truncation.
      expect(result.merged.includes('x'.repeat(2000))).toBe(true)
    })
  })
})

describe('rebaseTextPosition', () => {
  it('should shift a caret when text is inserted before it', () => {
    const previousText = 'Hello world'
    const nextText = 'Hello brave world'

    expect(rebaseTextPosition(11, diffText(previousText, nextText))).toBe(17)
  })

  it('should keep left-affinity positions before inserted text at the same index', () => {
    const changes = diffText('world', 'brave world')

    expect(rebaseTextPosition(0, changes, 'left')).toBe(0)
    expect(rebaseTextPosition(0, changes, 'right')).toBe(6)
  })
})

describe('rebaseTextRange', () => {
  it('should expand a selection when remote text is inserted inside it', () => {
    expect(rebaseTextRange(
      'Hello world',
      'Hello brave world',
      { start: 0, end: 11 },
      {
        startAffinity: 'left',
        endAffinity: 'right',
      },
    )).toEqual({
      start: 0,
      end: 17,
    })
  })

  it('should clamp rebased positions inside the next string', () => {
    expect(rebaseTextRange(
      'Hello world',
      'Hello',
      { start: 6, end: 11 },
    )).toEqual({
      start: 5,
      end: 5,
    })
  })
})
