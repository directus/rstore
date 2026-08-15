import type { RstoreDrizzleQueryParams } from '../utils'
import { eventHandler, getQuery, getRouterParams } from 'h3'
import { drizzleFindMany } from '../utils/operations'
import { parseSearchQuery } from '../utils/search-query'

export default eventHandler(async (event) => {
  const params = getRouterParams(event) as { collection: string }
  const query = getQuery(event)
  const searchQuery = parseSearchQuery<RstoreDrizzleQueryParams>(query.superjson)

  return drizzleFindMany({
    event,
    collection: params.collection,
    params,
    query,
    searchQuery,
  })
})
