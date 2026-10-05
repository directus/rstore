import { applyTextChanges, diffText, mergeText, rebaseTextPosition, rebaseTextRange } from '@rstore/multiplayer/text'
import { describe, expect, it } from 'vitest'

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
