import { describe, expect, it } from 'vitest'
import { createMonospaceQuery, serializeMonospaceQuery, stripPrimaryKeys } from '../src'

describe('createMonospaceQuery', () => {
  it('copies supported Monospace REST query options from top-level and params', () => {
    expect(createMonospaceQuery({
      fields: ['id', 'title'],
      filter: { completed: { _eq: false } },
      sort: [{ title: { direction: 'asc' } }],
      limit: 20,
      offset: 40,
      params: {
        meta: { totalCount: true },
      },
    })).toEqual({
      fields: ['id', 'title'],
      filter: { completed: { _eq: false } },
      sort: [{ title: { direction: 'asc' } }],
      limit: 20,
      offset: 40,
      meta: { totalCount: true },
    })
  })

  it('does not forward the rstore include option as a Monospace include', () => {
    expect(createMonospaceQuery({
      include: { author: true },
    })).toEqual({})
  })

  it('drops rstore function filters that only apply to the cache', () => {
    expect(createMonospaceQuery({
      filter: ((item: any) => item.completed) as any,
      limit: 5,
    })).toEqual({
      limit: 5,
    })
  })

  it('maps rstore pageIndex/pageSize when explicit pagination is absent', () => {
    expect(createMonospaceQuery({
      pageIndex: 2,
      pageSize: 25,
    })).toMatchObject({
      limit: 25,
      offset: 50,
    })
  })

  it('does not override explicit pagination', () => {
    expect(createMonospaceQuery({
      limit: 10,
      offset: 5,
      pageIndex: 2,
      pageSize: 25,
    })).toMatchObject({
      limit: 10,
      offset: 5,
    })
  })
})

describe('stripPrimaryKeys', () => {
  it('removes generated primary keys from mutation bodies', () => {
    expect(stripPrimaryKeys({
      id: 1,
      slug: 'todo',
      title: 'Todo',
    }, ['id', 'slug'])).toEqual({
      title: 'Todo',
    })
  })
})

describe('serializeMonospaceQuery', () => {
  /**
   * Serializes a query and returns its decoded search parameters.
   */
  function serialize(query: Record<string, any>): string[] {
    return [...serializeMonospaceQuery(query)].map(([key, value]) => `${key}=${value}`)
  }

  it('serializes nested include selections with comma-joined fields', () => {
    expect(serialize({
      fields: ['id', 'title'],
      include: {
        author: {
          fields: ['*'],
          include: {
            todos: { fields: ['id', 'title'], limit: -1 },
          },
        },
      },
    })).toEqual([
      'fields=id,title',
      'include[author][fields]=*',
      'include[author][include][todos][fields]=id,title',
      'include[author][include][todos][limit]=-1',
    ])
  })

  it('normalizes sort specifiers to the Monospace object form', () => {
    expect(serialize({
      sort: ['title', '-priority', { seats: 'desc' }, { label: {} }, { id: { direction: 'asc', nulls: 'last' } }],
    })).toEqual([
      'sort[0][title][direction]=asc',
      'sort[1][priority][direction]=desc',
      'sort[2][seats][direction]=desc',
      'sort[3][label][direction]=asc',
      'sort[4][id][direction]=asc',
      'sort[4][id][nulls]=last',
    ])
    expect(serialize({ sort: '-created_at' })).toEqual(['sort[0][created_at][direction]=desc'])
    // Multi-field sort objects keep their key order as separate specifiers.
    expect(serialize({ sort: [{ status: 'asc', created_at: 'desc' }] })).toEqual([
      'sort[0][status][direction]=asc',
      'sort[1][created_at][direction]=desc',
    ])
  })

  it('normalizes sort specifiers inside includes', () => {
    expect(serialize({
      include: { todos: { fields: ['*'], sort: ['-created_at'] } },
    })).toEqual([
      'include[todos][fields]=*',
      'include[todos][sort][0][created_at][direction]=desc',
    ])
  })

  it('keeps arrays outside field selections in bracket notation', () => {
    expect(serialize({ filter: { id: { _in: [1, 2] } } })).toEqual([
      'filter[id][_in][0]=1',
      'filter[id][_in][1]=2',
    ])
  })
})
