import { describe, expect, it } from 'vitest'
import { createMonospaceQuery, stripPrimaryKeys } from '../src'

describe('createMonospaceQuery', () => {
  it('copies supported Monospace REST query options from top-level and params', () => {
    expect(createMonospaceQuery({
      fields: ['id', 'title'],
      filter: { completed: { _eq: false } },
      sort: [{ title: { direction: 'asc' } }],
      limit: 20,
      offset: 40,
      params: {
        deep: {
          comments: {
            _limit: 2,
          },
        },
      },
    })).toEqual({
      fields: ['id', 'title'],
      filter: { completed: { _eq: false } },
      sort: [{ title: { direction: 'asc' } }],
      limit: 20,
      offset: 40,
      deep: {
        comments: {
          _limit: 2,
        },
      },
    })
  })

  it('copies deep and alias options from the top level', () => {
    expect(createMonospaceQuery({
      alias: { name: 'title' },
      deep: {
        comments: {
          _limit: 2,
        },
      },
    })).toEqual({
      alias: { name: 'title' },
      deep: {
        comments: {
          _limit: 2,
        },
      },
    })
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
