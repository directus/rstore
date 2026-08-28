import { describe, expect, it } from 'vitest'
import { createWrappedItemMetadata } from '../src/itemMetadata'

describe('wrapped item metadata', () => {
  it('allocates stable query sets only when accessed', () => {
    const metadata = createWrappedItemMetadata()

    expect(Object.getOwnPropertySymbols(metadata)).toHaveLength(0)

    const queries = metadata.queries
    queries.add('query')
    const dirtyQueries = metadata.dirtyQueries
    dirtyQueries.add('dirty')

    expect(metadata.queries).toBe(queries)
    expect(metadata.dirtyQueries).toBe(dirtyQueries)
    expect(Object.getOwnPropertySymbols(metadata)).toHaveLength(2)
    expect([...metadata.queries]).toEqual(['query'])
    expect([...metadata.dirtyQueries]).toEqual(['dirty'])
  })
})
