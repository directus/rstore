import { describe, expect, it } from 'vitest'
import { createDirectusQuery } from '../src/runtime/query'

describe('createDirectusQuery', () => {
  it('copies supported Directus query options from find options', () => {
    const filter = { completed: { _eq: false } }

    expect(createDirectusQuery({
      fields: ['id', 'title'],
      filter,
      search: 'ship',
      sort: ['-date_created'],
      limit: 50,
      offset: 10,
      page: 2,
      deep: { comments: { _limit: 2 } },
      alias: { all_translations: 'translations' },
      backlink: false,
      version: 'draft',
      versionRaw: true,
    })).toEqual({
      fields: ['id', 'title'],
      filter,
      search: 'ship',
      sort: ['-date_created'],
      limit: 50,
      offset: 10,
      page: 2,
      deep: { comments: { _limit: 2 } },
      alias: { all_translations: 'translations' },
      backlink: false,
      version: 'draft',
      versionRaw: true,
    })
  })

  it('maps rstore pageIndex/pageSize to Directus offset/limit', () => {
    expect(createDirectusQuery({
      pageIndex: 3,
      pageSize: 25,
    })).toMatchObject({
      limit: 25,
      offset: 75,
    })
  })

  it('does not override explicit Directus pagination', () => {
    expect(createDirectusQuery({
      limit: 10,
      offset: 5,
      pageIndex: 3,
      pageSize: 25,
    })).toMatchObject({
      limit: 10,
      offset: 5,
    })
  })

  it('allows callers to force the first-item limit', () => {
    expect(createDirectusQuery({
      limit: 50,
    }, {
      limit: 1,
    })).toMatchObject({
      limit: 1,
    })
  })
})
