import type { RstoreDrizzleQueryParamsOne } from '../../utils'
import { defineEventHandler, getQuery, getRouterParams } from 'h3'
import { drizzleFindOne } from '../../utils/operations'
import { parseSearchQuery } from '../../utils/search-query'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event) as { collection: string, key: string }
  const query = getQuery(event)
  const searchQuery = parseSearchQuery<RstoreDrizzleQueryParamsOne>(query.superjson)

  return drizzleFindOne({
    event,
    collection: params.collection,
    key: params.key,
    params,
    query,
    searchQuery,
  })
})
