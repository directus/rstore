import type { RstoreDrizzleQueryParams } from '../utils'
import { eventHandler, getQuery, getRouterParams } from 'h3'
import SuperJSON from 'superjson'
import { drizzleFindMany } from '../utils/operations'

export default eventHandler(async (event) => {
  const params = getRouterParams(event) as { collection: string }
  const query = getQuery(event)
  const searchQuery = (SuperJSON.parse(query.superjson as any) ?? {}) as RstoreDrizzleQueryParams

  return drizzleFindMany({
    event,
    collection: params.collection,
    params,
    query,
    searchQuery,
  })
})
