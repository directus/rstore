import { describe, expect, it } from 'vitest'
import {
  and,
  arrayContained,
  arrayContains,
  arrayOverlaps,
  between,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  notBetween,
  notIlike,
  notInArray,
  notLike,
  or,
} from '../src/runtime/utils/where'
import { filterWhere } from '../src/runtime/where'

// These builders form the public DSL for `where` filters. The shape of the
// returned AST is load-bearing: `filterWhere` and every custom realtime
// server consume it directly. Test both the AST shape *and* the round-trip
// through the evaluator to catch any drift between builder and matcher.

describe('where builders — AST shape', () => {
  it('binary operators pack field + value', () => {
    expect(eq('a', 1)).toEqual({ operator: 'eq', field: 'a', value: 1 })
    expect(ne('a', 1)).toEqual({ operator: 'ne', field: 'a', value: 1 })
    expect(gt('a', 1)).toEqual({ operator: 'gt', field: 'a', value: 1 })
    expect(lt('a', 1)).toEqual({ operator: 'lt', field: 'a', value: 1 })
    expect(gte('a', 1)).toEqual({ operator: 'gte', field: 'a', value: 1 })
    expect(lte('a', 1)).toEqual({ operator: 'lte', field: 'a', value: 1 })
    expect(inArray('a', [1, 2])).toEqual({ operator: 'inArray', field: 'a', value: [1, 2] })
    expect(notInArray('a', [1, 2])).toEqual({ operator: 'notInArray', field: 'a', value: [1, 2] })
    expect(like('a', 'x%')).toEqual({ operator: 'like', field: 'a', value: 'x%' })
    expect(notLike('a', 'x%')).toEqual({ operator: 'notLike', field: 'a', value: 'x%' })
    expect(ilike('a', 'x%')).toEqual({ operator: 'ilike', field: 'a', value: 'x%' })
    expect(notIlike('a', 'x%')).toEqual({ operator: 'notIlike', field: 'a', value: 'x%' })
    expect(arrayContains('tags', 'a')).toEqual({ operator: 'arrayContains', field: 'tags', value: 'a' })
    expect(arrayContained('tag', ['a', 'b'])).toEqual({ operator: 'arrayContained', field: 'tag', value: ['a', 'b'] })
    expect(arrayOverlaps('tags', ['a'])).toEqual({ operator: 'arrayOverlaps', field: 'tags', value: ['a'] })
  })

  it('ternary operators pack both bound values', () => {
    expect(between('a', 1, 10)).toEqual({ operator: 'between', field: 'a', value1: 1, value2: 10 })
    expect(notBetween('a', 1, 10)).toEqual({ operator: 'notBetween', field: 'a', value1: 1, value2: 10 })
  })

  it('unary operators record only the field', () => {
    expect(isNull('a')).toEqual({ operator: 'isNull', field: 'a' })
    expect(isNotNull('a')).toEqual({ operator: 'isNotNull', field: 'a' })
  })

  it('not wraps a single condition', () => {
    const inner = eq('a', 1)
    expect(not(inner)).toEqual({ operator: 'not', condition: inner })
  })

  it('and/or collect variadic conditions into the group', () => {
    const a = eq('a', 1)
    const b = eq('b', 2)
    expect(and(a, b)).toEqual({ operator: 'and', conditions: [a, b] })
    expect(or(a, b)).toEqual({ operator: 'or', conditions: [a, b] })
    // Zero-arg forms are legal — see empty-group behavior in filter-where tests.
    expect(and()).toEqual({ operator: 'and', conditions: [] })
    expect(or()).toEqual({ operator: 'or', conditions: [] })
  })
})

describe('where builders — round trip through filterWhere', () => {
  // Lightweight check that the builder output is actually consumable by the
  // matcher. If someone renames an operator on one side but not the other,
  // one of these will blow up.
  it('evaluates a realistic composite filter', () => {
    const filter = and(
      eq('done', false),
      or(
        gte('priority', 3),
        like('title', 'urgent%'),
      ),
      not(isNull('assignee')),
    )
    // Matches: undone, priority>=3, assignee set.
    expect(filterWhere({ done: false, priority: 5, title: 'ship it', assignee: 'alice' }, filter, 'sqlite')).toBe(true)
    // Matches: undone, priority<3 but title starts with 'urgent', assignee set.
    expect(filterWhere({ done: false, priority: 1, title: 'urgent fix', assignee: 'bob' }, filter, 'sqlite')).toBe(true)
    // Fails: done=true short-circuits the outer AND.
    expect(filterWhere({ done: true, priority: 5, title: 'urgent', assignee: 'alice' }, filter, 'sqlite')).toBe(false)
    // Fails: no assignee.
    expect(filterWhere({ done: false, priority: 5, title: 'urgent', assignee: null }, filter, 'sqlite')).toBe(false)
  })
})
