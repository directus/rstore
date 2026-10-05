import type { Delta } from '@rstore/multiplayer/ot'
import { applyDocOps, cloneDocState, rebaseOnSnapshot } from '@rstore/multiplayer/ot'
import { describe, expect, it } from 'vitest'
import { buildDoc } from './harness/docs'
import { runFuzz } from './harness/fuzz'

/** Base, local and server versions of one paragraph, merged by the snapshot fallback. */
function merge(base: Delta, local: Delta, server: Delta) {
  const result = rebaseOnSnapshot(buildDoc([{ id: 'p1', content: base }]), buildDoc([{ id: 'p1', content: local }]), buildDoc([{ id: 'p1', content: server }]))
  const merged = cloneDocState(buildDoc([{ id: 'p1', content: server }]))
  applyDocOps(merged, result.ops)
  return { content: merged.nodes.get('p1')!.content, conflicts: result.conflicts }
}

describe('snapshot merge fallback', () => {
  it('keeps the marks of characters the server added, even when the local side typed the same text', () => {
    const { content } = merge(
      [{ insert: 'ab' }],
      [{ insert: 'a' }, { insert: 'X', attributes: { author: 'me' } }, { insert: 'b' }],
      [{ insert: 'a' }, { insert: 'X', attributes: { author: 'them', bold: true } }, { insert: 'b' }],
    )
    expect(content).toEqual([{ insert: 'a' }, { insert: 'X', attributes: { author: 'them', bold: true } }, { insert: 'b' }])
  })

  it('applies local mark changes key by key over the server marks', () => {
    const { content } = merge(
      [{ insert: 'abc' }],
      [{ insert: 'a' }, { insert: 'b', attributes: { bold: true } }, { insert: 'c' }],
      [{ insert: 'a' }, { insert: 'b', attributes: { italic: true } }, { insert: 'cZ' }],
    )
    expect(content).toEqual([{ insert: 'a' }, { insert: 'b', attributes: { bold: true, italic: true } }, { insert: 'cZ' }])
  })

  it('never drops a character the server added, even when a local deletion of an equal character could be mapped onto it', () => {
    const { content } = merge(
      [{ insert: 'a' }],
      [],
      [{ insert: 'a' }, { insert: 'a', attributes: { author: 'them' } }],
    )
    expect(content).toContainEqual({ insert: 'a', attributes: { author: 'them' } })
  })

  it('tells a local replacement from a format change with the pending ops, and keeps the other user\'s characters intact', () => {
    const base = buildDoc([{ id: 'p1', content: [{ insert: 'a😀', attributes: { author: 'them' } }] }])
    // Locally: delete their "a😀", type an own "😀" (the same character).
    const pending = [{ t: 'text' as const, node: 'p1', ops: [{ delete: 3 }, { insert: '😀', attributes: { author: 'me' } }] }]
    const local = cloneDocState(base)
    applyDocOps(local, pending)
    const snapshot = buildDoc([{ id: 'p1', content: [{ insert: 'a😀', attributes: { author: 'them' } }, { insert: '!', attributes: { author: 'them' } }] }])
    const result = rebaseOnSnapshot(base, local, snapshot, 'conflict', pending)
    // Their characters are deleted, not re-labelled; the own emoji is inserted.
    expect(result.ops).toEqual([{ t: 'text', node: 'p1', ops: [{ insert: '😀', attributes: { author: 'me' } }, { delete: 3 }] }])
    applyDocOps(snapshot, result.ops)
    expect(snapshot.nodes.get('p1')!.content).toEqual([{ insert: '😀', attributes: { author: 'me' } }, { insert: '!', attributes: { author: 'them' } }])
  })

  it('sends a local format change as a format of the kept character', () => {
    const base = buildDoc([{ id: 'p1', content: [{ insert: 'ab', attributes: { author: 'them' } }] }])
    const pending = [{ t: 'text' as const, node: 'p1', ops: [{ retain: 1, attributes: { bold: true } }] }]
    const local = cloneDocState(base)
    applyDocOps(local, pending)
    const snapshot = buildDoc([{ id: 'p1', content: [{ insert: 'ab', attributes: { author: 'them' } }, { insert: '!' }] }])
    const result = rebaseOnSnapshot(base, local, snapshot, 'conflict', pending)
    expect(result.ops).toEqual([{ t: 'text', node: 'p1', ops: [{ retain: 1, attributes: { bold: true } }] }])
  })

  // Fuzz seeds where a reloading client re-labelled (and dropped) another
  // user's characters while merging its pending edits on a snapshot.
  it('never makes another client\'s undo remove foreign characters (recorded redaction fuzz seeds)', async () => {
    for (const seed of [134, 545]) {
      const result = await runFuzz({ seed, clients: 4, txPerClient: 100, privateNodes: true })
      expect(result.divergence, `seed ${seed}`).toBeUndefined()
      expect(result.undoViolations, `seed ${seed}: ${result.violation}`).toBe(0)
    }
  }, 60_000)
})
