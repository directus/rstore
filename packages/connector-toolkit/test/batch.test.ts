import { describe, expect, it } from 'vitest'
import { createBatchedRelationFilter } from '../src'

describe('createBatchedRelationFilter', () => {
  it('creates a deduplicated _in filter for single-field joins', () => {
    const filter = createBatchedRelationFilter({ id: 'author_id' }, [
      { author_id: 1 },
      { author_id: 2 },
      { author_id: 1 },
      { author_id: null },
      { author_id: undefined },
    ])

    expect(filter).toEqual({ id: { _in: [1, 2] } })
  })

  it('returns undefined when no single-field value is usable', () => {
    expect(createBatchedRelationFilter({ id: 'author_id' }, [{ author_id: null }, {}])).toBeUndefined()
    expect(createBatchedRelationFilter({ id: 'author_id' }, [])).toBeUndefined()
  })

  it('creates _or/_and equality groups for composite joins', () => {
    const filter = createBatchedRelationFilter({ tenant: 'tenant_id', id: 'post_id' }, [
      { tenant_id: 'a', post_id: 1 },
      { tenant_id: 'b', post_id: 2 },
    ])

    expect(filter).toEqual({
      _or: [
        { _and: [{ tenant: { _eq: 'a' } }, { id: { _eq: 1 } }] },
        { _and: [{ tenant: { _eq: 'b' } }, { id: { _eq: 2 } }] },
      ],
    })
  })

  it('skips composite tuples with missing values and dedupes tuples', () => {
    const filter = createBatchedRelationFilter({ tenant: 'tenant_id', id: 'post_id' }, [
      { tenant_id: 'a', post_id: 1 },
      { tenant_id: 'a', post_id: 1 },
      { tenant_id: 'a', post_id: null },
      { tenant_id: undefined, post_id: 2 },
    ])

    expect(filter).toEqual({
      _or: [
        { _and: [{ tenant: { _eq: 'a' } }, { id: { _eq: 1 } }] },
      ],
    })
  })

  it('returns undefined when every composite tuple is incomplete', () => {
    expect(createBatchedRelationFilter({ tenant: 'tenant_id', id: 'post_id' }, [
      { tenant_id: 'a' },
      { post_id: 1 },
    ])).toBeUndefined()
  })

  it('reads source values through the readValue option', () => {
    const filter = createBatchedRelationFilter({ id: 'author_id' }, [
      { raw: { author_id: 7 } },
    ], {
      readValue: (item, field) => item.raw[field],
    })

    expect(filter).toEqual({ id: { _in: [7] } })
  })
})
