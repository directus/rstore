import { describe, expect, it } from 'vitest'
import { filterWhere } from '../src/runtime/where'

// `filterWhere` is used on both sides of the wire — in the WS matcher on the
// server and in `cacheFilterFirst` / `cacheFilterMany` on the client. A
// regression here silently returns wrong rows, so each operator gets a
// dedicated check.

const DIALECT = 'sqlite' as const

describe('filterWhere — short-circuits', () => {
  it('treats a null condition as matching everything', () => {
    // The cache filters pass the `where` through unconditionally; an
    // undefined/null filter must therefore accept any record.
    expect(filterWhere({ id: 1 }, null as any, DIALECT)).toBe(true)
  })

  it('throws on an unknown operator', () => {
    expect(() => filterWhere({ id: 1 }, { operator: 'bogus' } as any, DIALECT)).toThrow(/Unknown operator/)
  })

  it('throws on an invalid condition shape', () => {
    expect(() => filterWhere({ id: 1 }, {} as any, DIALECT)).toThrow(/Invalid condition/)
  })
})

describe('filterWhere — logical groups', () => {
  it('and() is true only when every leaf matches', () => {
    const item = { a: 1, b: 2 }
    const cond = {
      operator: 'and' as const,
      conditions: [
        { operator: 'eq' as const, field: 'a', value: 1 },
        { operator: 'eq' as const, field: 'b', value: 2 },
      ],
    }
    expect(filterWhere(item, cond, DIALECT)).toBe(true)
    expect(filterWhere({ a: 1, b: 3 }, cond, DIALECT)).toBe(false)
  })

  it('or() is true when any leaf matches', () => {
    const cond = {
      operator: 'or' as const,
      conditions: [
        { operator: 'eq' as const, field: 'a', value: 1 },
        { operator: 'eq' as const, field: 'b', value: 2 },
      ],
    }
    expect(filterWhere({ a: 0, b: 2 }, cond, DIALECT)).toBe(true)
    expect(filterWhere({ a: 0, b: 0 }, cond, DIALECT)).toBe(false)
  })

  it('not() inverts the inner condition', () => {
    const cond = {
      operator: 'not' as const,
      condition: { operator: 'eq' as const, field: 'a', value: 1 },
    }
    expect(filterWhere({ a: 2 }, cond, DIALECT)).toBe(true)
    expect(filterWhere({ a: 1 }, cond, DIALECT)).toBe(false)
  })

  it('empty and() short-circuits to true (vacuous truth)', () => {
    // `Array.every` on an empty array returns true — worth pinning so that a
    // stray empty group never silently filters everything out.
    expect(filterWhere({}, { operator: 'and', conditions: [] }, DIALECT)).toBe(true)
  })

  it('empty or() short-circuits to false', () => {
    expect(filterWhere({}, { operator: 'or', conditions: [] }, DIALECT)).toBe(false)
  })
})

describe('filterWhere — null checks', () => {
  it('isNull matches both null and undefined (== null)', () => {
    expect(filterWhere({ a: null }, { operator: 'isNull', field: 'a' }, DIALECT)).toBe(true)
    expect(filterWhere({ a: undefined }, { operator: 'isNull', field: 'a' }, DIALECT)).toBe(true)
    expect(filterWhere({}, { operator: 'isNull', field: 'a' }, DIALECT)).toBe(true)
    expect(filterWhere({ a: 0 }, { operator: 'isNull', field: 'a' }, DIALECT)).toBe(false)
  })

  it('isNotNull rejects both null and undefined', () => {
    expect(filterWhere({ a: 1 }, { operator: 'isNotNull', field: 'a' }, DIALECT)).toBe(true)
    expect(filterWhere({ a: null }, { operator: 'isNotNull', field: 'a' }, DIALECT)).toBe(false)
    expect(filterWhere({}, { operator: 'isNotNull', field: 'a' }, DIALECT)).toBe(false)
  })
})

describe('filterWhere — equality & comparison', () => {
  it('eq uses strict equality (no type coercion)', () => {
    expect(filterWhere({ a: 1 }, { operator: 'eq', field: 'a', value: 1 }, DIALECT)).toBe(true)
    expect(filterWhere({ a: '1' }, { operator: 'eq', field: 'a', value: 1 }, DIALECT)).toBe(false)
  })

  it('ne is strict inequality', () => {
    expect(filterWhere({ a: 2 }, { operator: 'ne', field: 'a', value: 1 }, DIALECT)).toBe(true)
    expect(filterWhere({ a: 1 }, { operator: 'ne', field: 'a', value: 1 }, DIALECT)).toBe(false)
  })

  it.each([
    ['gt', 2, 1, true],
    ['gt', 1, 1, false],
    ['lt', 1, 2, true],
    ['lt', 1, 1, false],
    ['gte', 1, 1, true],
    ['gte', 0, 1, false],
    ['lte', 1, 1, true],
    ['lte', 2, 1, false],
  ])('%s(%p, %p) === %p', (operator, fieldValue, value, expected) => {
    expect(filterWhere({ a: fieldValue }, { operator: operator as any, field: 'a', value }, DIALECT)).toBe(expected)
  })
})

describe('filterWhere — between / notBetween', () => {
  it('between is inclusive on both bounds', () => {
    const cond = { operator: 'between' as const, field: 'a', value1: 1, value2: 3 }
    expect(filterWhere({ a: 1 }, cond, DIALECT)).toBe(true)
    expect(filterWhere({ a: 2 }, cond, DIALECT)).toBe(true)
    expect(filterWhere({ a: 3 }, cond, DIALECT)).toBe(true)
    expect(filterWhere({ a: 0 }, cond, DIALECT)).toBe(false)
    expect(filterWhere({ a: 4 }, cond, DIALECT)).toBe(false)
  })

  it('notBetween excludes the closed interval', () => {
    const cond = { operator: 'notBetween' as const, field: 'a', value1: 1, value2: 3 }
    expect(filterWhere({ a: 0 }, cond, DIALECT)).toBe(true)
    expect(filterWhere({ a: 4 }, cond, DIALECT)).toBe(true)
    // Boundaries are *in* the range, so `notBetween` must reject them.
    expect(filterWhere({ a: 1 }, cond, DIALECT)).toBe(false)
    expect(filterWhere({ a: 3 }, cond, DIALECT)).toBe(false)
  })
})

describe('filterWhere — set membership', () => {
  it('inArray checks presence in the allowed set', () => {
    expect(filterWhere({ a: 2 }, { operator: 'inArray', field: 'a', value: [1, 2, 3] }, DIALECT)).toBe(true)
    expect(filterWhere({ a: 4 }, { operator: 'inArray', field: 'a', value: [1, 2, 3] }, DIALECT)).toBe(false)
  })

  it('notInArray is the negation', () => {
    expect(filterWhere({ a: 4 }, { operator: 'notInArray', field: 'a', value: [1, 2, 3] }, DIALECT)).toBe(true)
    expect(filterWhere({ a: 2 }, { operator: 'notInArray', field: 'a', value: [1, 2, 3] }, DIALECT)).toBe(false)
  })
})

describe('filterWhere — like / ilike pattern matching', () => {
  it('like % matches zero-or-more chars', () => {
    expect(filterWhere({ name: 'hello world' }, { operator: 'like', field: 'name', value: 'hello%' }, DIALECT)).toBe(true)
    expect(filterWhere({ name: 'hello' }, { operator: 'like', field: 'name', value: 'hello%' }, DIALECT)).toBe(true)
    expect(filterWhere({ name: 'hi' }, { operator: 'like', field: 'name', value: 'hello%' }, DIALECT)).toBe(false)
  })

  it('like _ matches a single char', () => {
    expect(filterWhere({ name: 'ab' }, { operator: 'like', field: 'name', value: 'a_' }, DIALECT)).toBe(true)
    // `_` is translated to `.` (any single char), but the anchor-free regex
    // also matches longer strings — lock in the current behavior.
    expect(filterWhere({ name: 'a' }, { operator: 'like', field: 'name', value: 'a_' }, DIALECT)).toBe(false)
  })

  it('like is case-insensitive on sqlite only', () => {
    // SQLite's LIKE is case-insensitive for ASCII by default; other dialects
    // are case-sensitive. `filterWhere` mirrors that.
    expect(filterWhere({ name: 'HELLO' }, { operator: 'like', field: 'name', value: 'hello' }, 'sqlite')).toBe(true)
    expect(filterWhere({ name: 'HELLO' }, { operator: 'like', field: 'name', value: 'hello' }, 'postgresql')).toBe(false)
  })

  it('notLike is the negation', () => {
    expect(filterWhere({ name: 'hi' }, { operator: 'notLike', field: 'name', value: 'hello%' }, DIALECT)).toBe(true)
    expect(filterWhere({ name: 'hello' }, { operator: 'notLike', field: 'name', value: 'hello%' }, DIALECT)).toBe(false)
  })

  it('ilike is always case-insensitive regardless of dialect', () => {
    expect(filterWhere({ name: 'HELLO' }, { operator: 'ilike', field: 'name', value: 'hello' }, 'postgresql')).toBe(true)
    expect(filterWhere({ name: 'HELLO' }, { operator: 'ilike', field: 'name', value: 'hello' }, 'mysql')).toBe(true)
  })

  it('notIlike is the negation of ilike', () => {
    expect(filterWhere({ name: 'HELLO' }, { operator: 'notIlike', field: 'name', value: 'hello' }, 'postgresql')).toBe(false)
    expect(filterWhere({ name: 'world' }, { operator: 'notIlike', field: 'name', value: 'hello' }, 'postgresql')).toBe(true)
  })
})

describe('filterWhere — array ops', () => {
  it('arrayContains returns true when the field contains the scalar', () => {
    expect(filterWhere({ tags: ['a', 'b'] }, { operator: 'arrayContains', field: 'tags', value: 'a' }, DIALECT)).toBe(true)
    expect(filterWhere({ tags: ['a', 'b'] }, { operator: 'arrayContains', field: 'tags', value: 'c' }, DIALECT)).toBe(false)
    // Non-array field shouldn't throw — just fail to match.
    expect(filterWhere({ tags: null }, { operator: 'arrayContains', field: 'tags', value: 'a' }, DIALECT)).toBe(false)
  })

  it('arrayContained returns true when the scalar field is within the value array', () => {
    expect(filterWhere({ tag: 'a' }, { operator: 'arrayContained', field: 'tag', value: ['a', 'b'] }, DIALECT)).toBe(true)
    expect(filterWhere({ tag: 'c' }, { operator: 'arrayContained', field: 'tag', value: ['a', 'b'] }, DIALECT)).toBe(false)
  })

  it('arrayOverlaps returns true if either array shares an element', () => {
    expect(filterWhere({ tags: ['a', 'c'] }, { operator: 'arrayOverlaps', field: 'tags', value: ['c', 'd'] }, DIALECT)).toBe(true)
    expect(filterWhere({ tags: ['a', 'b'] }, { operator: 'arrayOverlaps', field: 'tags', value: ['c', 'd'] }, DIALECT)).toBe(false)
    expect(filterWhere({ tags: null }, { operator: 'arrayOverlaps', field: 'tags', value: ['c', 'd'] }, DIALECT)).toBe(false)
  })
})
