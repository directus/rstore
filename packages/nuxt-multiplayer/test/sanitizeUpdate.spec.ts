import { describe, expect, it } from 'vitest'
import { sanitizeMultiplayerUpdate } from '../src/runtime/utils/sanitizeUpdate'

describe('sanitizeMultiplayerUpdate', () => {
  it('passes through plain fields', () => {
    expect(sanitizeMultiplayerUpdate({ title: 'a', body: 'b' })).toEqual({ title: 'a', body: 'b' })
  })

  it('always drops prototype-polluting keys', () => {
    // JSON.parse creates `__proto__` as an own property — exactly what a
    // hostile peer would send over the wire.
    const hostile = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"x": 1}, "prototype": {}, "title": "ok"}')
    const sanitized = sanitizeMultiplayerUpdate(hostile)

    expect(sanitized).toEqual({ title: 'ok' })
    expect(Object.keys(sanitized!)).toEqual(['title'])
    expect(({} as any).polluted).toBeUndefined()
  })

  it('filters keys against the allowlist when provided', () => {
    const sanitized = sanitizeMultiplayerUpdate(
      { title: 'a', isAdmin: true, secret: 'x' },
      ['title', 'body'],
    )
    expect(sanitized).toEqual({ title: 'a' })
  })

  it('returns null when nothing survives', () => {
    expect(sanitizeMultiplayerUpdate({ hacked: true }, ['title'])).toBeNull()
    expect(sanitizeMultiplayerUpdate(JSON.parse('{"__proto__": {"a": 1}}'))).toBeNull()
    expect(sanitizeMultiplayerUpdate({})).toBeNull()
  })
})
