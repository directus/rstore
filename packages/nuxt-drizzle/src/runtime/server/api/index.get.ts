import type { RstoreDrizzleQueryParams } from '../utils'
import { eventHandler, getHeader, getQuery, getRouterParams } from 'h3'
import { queryCacheHeader } from '../../utils/query-cache'
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
    cacheMode: getHeader(event, queryCacheHeader),
  })
})
