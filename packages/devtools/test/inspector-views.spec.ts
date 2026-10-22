import { describe, expect, it } from 'vitest'
import { CacheQuery } from '../app/stores/views'

describe('inspector cache query ownership', () => {
  it('resets pagination before applying a new filter or collection', () => {
    const query = new CacheQuery()
    query.select('Books')
    query.offset = 200
    query.filter('0', 'novel')
    expect(query.parameters()).toEqual({
      collection: 'Books',
      keySearch: '0',
      contentSearch: 'novel',
      view: 'effective',
      page: { offset: 0, limit: 100 },
    })
    query.offset = 300
    query.layerId = 'optimistic'
    query.select('Authors')
    expect(query.parameters()).toEqual({
      collection: 'Authors',
      keySearch: '0',
      contentSearch: 'novel',
      view: 'effective',
      page: { offset: 0, limit: 100 },
    })
  })
})
