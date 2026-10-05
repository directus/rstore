import type { Delta } from '@rstore/multiplayer/ot'
import { applyTextOp, diffDelta, OtValidationError, transformTextOp, transformTextPosition } from '@rstore/multiplayer/ot'
import { describe, expect, it } from 'vitest'

const text = (value: string, attributes?: Record<string, unknown>): Delta => [attributes ? { insert: value, attributes } : { insert: value }]

describe('applyTextOp', () => {
  it('applies inserts, deletes and formats and merges equal runs', () => {
    const result = applyTextOp(text('hello world'), [
      { retain: 6, attributes: { bold: true } },
      { delete: 5 },
      { insert: 'there', attributes: { bold: true } },
    ])
    expect(result).toEqual(text('hello there', { bold: true }))
  })

  it('removes a mark with null', () => {
    expect(applyTextOp(text('abc', { bold: true, italic: true }), [{ retain: 1, attributes: { bold: null } }])).toEqual([
      { insert: 'a', attributes: { italic: true } },
      { insert: 'bc', attributes: { bold: true, italic: true } },
    ])
  })

  it('counts embeds as one unit', () => {
    const content: Delta = [{ insert: 'a' }, { insert: { hardBreak: true } }, { insert: 'b' }]
    expect(applyTextOp(content, [{ retain: 1 }, { delete: 1 }])).toEqual(text('ab'))
  })

  it('rejects ops that run past the content', () => {
    expect(() => applyTextOp(text('ab'), [{ retain: 3 }])).toThrow(OtValidationError)
    expect(() => applyTextOp(text('ab'), [{ delete: 3 }])).toThrow(OtValidationError)
  })

  it('rejects ops that split a surrogate pair', () => {
    // '😀' is two UTF-16 code units.
    expect(() => applyTextOp(text('a😀b'), [{ retain: 2 }, { insert: 'x' }])).toThrow(OtValidationError)
    expect(() => applyTextOp(text('a😀b'), [{ retain: 1 }, { delete: 1 }])).toThrow(OtValidationError)
    expect(() => applyTextOp(text('a😀b'), [{ retain: 2, attributes: { bold: true } }])).toThrow(OtValidationError)
    expect(() => applyTextOp(text('ab'), [{ insert: '\uD83D' }])).toThrow(OtValidationError)
    expect(applyTextOp(text('a😀b'), [{ retain: 3 }, { insert: 'x' }])).toEqual(text('a😀xb'))
  })

  it('rejects malformed components and embeds', () => {
    expect(() => applyTextOp(text('ab'), [{ retain: 0 }] as any)).toThrow(OtValidationError)
    expect(() => applyTextOp(text('ab'), [{ insert: { a: 1, b: 2 } }])).toThrow(OtValidationError)
    expect(() => applyTextOp(text('ab'), [{ insert: 'x', attributes: { bold: null } }])).toThrow(OtValidationError)
  })
})

describe('transformTextOp', () => {
  it('puts the first sequenced insert first on a tie', () => {
    const first = [{ retain: 1 }, { insert: 'A' }]
    const later = [{ retain: 1 }, { insert: 'B' }]
    expect(applyTextOp(applyTextOp(text('xy'), first), transformTextOp(later, first, false))).toEqual(text('xABy'))
  })

  it('lets the later sequenced format win on the same key', () => {
    const first = [{ retain: 2, attributes: { link: 'https://a' } }]
    const later = [{ retain: 2, attributes: { link: 'https://b' } }]
    const content = text('ab')
    const serverPath = applyTextOp(applyTextOp(content, first), transformTextOp(later, first, false))
    const clientPath = applyTextOp(applyTextOp(content, later), transformTextOp(first, later, true))
    expect(serverPath).toEqual(text('ab', { link: 'https://b' }))
    expect(clientPath).toEqual(serverPath)
  })

  it('extends an expandable mark over text typed strictly inside the formatted range', () => {
    const bold = [{ retain: 11, attributes: { bold: true } }]
    const typing = [{ retain: 5 }, { insert: '!' }]
    const content = text('hello world')
    const serverPath = applyTextOp(applyTextOp(content, bold), transformTextOp(typing, bold, false))
    const clientPath = applyTextOp(applyTextOp(content, typing), transformTextOp(bold, typing, true))
    expect(serverPath).toEqual(text('hello! world', { bold: true }))
    expect(clientPath).toEqual(serverPath)
  })

  it('does not extend a mark over text typed at the edge of the range or for links', () => {
    const content = text('hello world')
    const edge = transformTextOp([{ insert: '>' }], [{ retain: 5, attributes: { bold: true } }], false)
    expect(edge).toEqual([{ insert: '>' }])
    const link = transformTextOp([{ retain: 3 }, { insert: '!' }], [{ retain: 5, attributes: { link: 'https://a' } }], false)
    expect(applyTextOp(applyTextOp(content, [{ retain: 5, attributes: { link: 'https://a' } }]), link)).toEqual([
      { insert: 'hel', attributes: { link: 'https://a' } },
      { insert: '!' },
      { insert: 'lo', attributes: { link: 'https://a' } },
      { insert: ' world' },
    ])
  })

  it('honours a custom expand policy', () => {
    const op = transformTextOp([{ retain: 2 }, { insert: '!' }], [{ retain: 5, attributes: { bold: true } }], false, { expand: () => false })
    expect(op).toEqual([{ retain: 2 }, { insert: '!' }])
  })
})

describe('transformTextPosition', () => {
  it('moves past an insert at the position only with right affinity', () => {
    const op = [{ retain: 2 }, { insert: 'xyz' }]
    expect(transformTextPosition(op, 2, 'left')).toBe(2)
    expect(transformTextPosition(op, 2, 'right')).toBe(5)
    expect(transformTextPosition([{ retain: 1 }, { delete: 3 }], 3, 'left')).toBe(1)
  })
})

describe('diffDelta', () => {
  it('reproduces the target and never splits a surrogate pair', () => {
    // Both emoji share the high surrogate \uD83D: a code-unit diff would only
    // replace the low surrogate.
    const before = text('a😀b')
    const after = text('a😁b')
    const op = diffDelta(before, after)
    expect(op).toEqual([{ retain: 1 }, { insert: '😁' }, { delete: 2 }])
    expect(applyTextOp(before, op)).toEqual(after)
  })

  it('emits format changes for unchanged text', () => {
    const op = diffDelta(text('abc'), [{ insert: 'a' }, { insert: 'b', attributes: { bold: true } }, { insert: 'c' }])
    expect(op).toEqual([{ retain: 1 }, { retain: 1, attributes: { bold: true } }])
  })

  it('handles embeds', () => {
    const before: Delta = [{ insert: 'a' }, { insert: { hardBreak: true } }]
    const after: Delta = [{ insert: 'a' }, { insert: { mention: { id: 'u1' } } }, { insert: { hardBreak: true } }]
    expect(applyTextOp(before, diffDelta(before, after))).toEqual(after)
  })
})
