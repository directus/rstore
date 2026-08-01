import { describe, expect, it } from 'vitest'
import { likeMatch, MAX_LIKE_PATTERN_LENGTH } from '../src/runtime/utils/like'

// `likeMatch` replaces the previous RegExp-based translation of SQL LIKE
// patterns. The RegExp version passed every regex metacharacter through
// verbatim, which allowed unauthenticated ReDoS via realtime subscription
// `where` filters (e.g. `(a+)+$`), and it was unanchored while SQL LIKE is a
// full-string match. These tests pin down the safe, SQL-faithful semantics.

describe('likeMatch — SQL LIKE semantics', () => {
  it('% matches zero or more characters', () => {
    expect(likeMatch('hello%', 'hello world')).toBe(true)
    expect(likeMatch('hello%', 'hello')).toBe(true)
    expect(likeMatch('hello%', 'hi')).toBe(false)
    expect(likeMatch('%world', 'hello world')).toBe(true)
    expect(likeMatch('%llo wo%', 'hello world')).toBe(true)
  })

  it('_ matches exactly one character', () => {
    expect(likeMatch('a_', 'ab')).toBe(true)
    expect(likeMatch('a_', 'a')).toBe(false)
    expect(likeMatch('a_c', 'abc')).toBe(true)
    expect(likeMatch('a_c', 'ac')).toBe(false)
  })

  it('is anchored: the whole string must match, like SQL LIKE', () => {
    // The old regex translation matched anywhere in the string.
    expect(likeMatch('a_', 'abc')).toBe(false)
    expect(likeMatch('world', 'hello world')).toBe(false)
    expect(likeMatch('hello', 'hello world')).toBe(false)
    expect(likeMatch('hello world', 'hello world')).toBe(true)
  })

  it('treats regex metacharacters as literals', () => {
    expect(likeMatch('a.c', 'abc')).toBe(false)
    expect(likeMatch('a.c', 'a.c')).toBe(true)
    expect(likeMatch('(a+)+', '(a+)+')).toBe(true)
    expect(likeMatch('a|b', 'a')).toBe(false)
    expect(likeMatch('[abc]', 'a')).toBe(false)
    expect(likeMatch('^a$', 'a')).toBe(false)
  })

  it('is case-sensitive by default, case-insensitive on demand', () => {
    expect(likeMatch('hello', 'HELLO')).toBe(false)
    expect(likeMatch('hello', 'HELLO', true)).toBe(true)
  })

  it('never matches a null or undefined value (SQL: NULL LIKE p is not true)', () => {
    expect(likeMatch('%', null)).toBe(false)
    expect(likeMatch('%', undefined)).toBe(false)
  })

  it('coerces non-string values to strings', () => {
    expect(likeMatch('42', 42)).toBe(true)
    expect(likeMatch('4_', 42)).toBe(true)
    expect(likeMatch('true', true)).toBe(true)
  })
})

describe('likeMatch — hostile input', () => {
  it('evaluates classic ReDoS patterns in linear-ish time', () => {
    // `(a+)+$` against a long non-matching string blocked the event loop for
    // tens of seconds with the RegExp implementation.
    const text = `${'a'.repeat(200)}!`
    const start = Date.now()
    expect(likeMatch('(a+)+$', text)).toBe(false)
    expect(likeMatch(`%${'a%'.repeat(100)}b`, text)).toBe(false)
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('rejects patterns above the length cap', () => {
    const pattern = 'a'.repeat(MAX_LIKE_PATTERN_LENGTH + 1)
    expect(() => likeMatch(pattern, 'a')).toThrow(/pattern too long/i)
  })

  it('accepts a pattern exactly at the cap', () => {
    const pattern = 'a'.repeat(MAX_LIKE_PATTERN_LENGTH)
    expect(likeMatch(pattern, 'a'.repeat(MAX_LIKE_PATTERN_LENGTH))).toBe(true)
  })

  it('does not throw SyntaxError on unbalanced regex syntax', () => {
    // `new RegExp('(')` throws — the matcher must treat it as a literal.
    expect(likeMatch('(', '(')).toBe(true)
    expect(likeMatch('[', '[')).toBe(true)
  })
})
