import type { RstoreDrizzleQueryParamsOne } from '../../utils'
import { defineEventHandler, getQuery, getRouterParams } from 'h3'
import SuperJSON from 'superjson'
import { drizzleFindOne } from '../../utils/operations'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event) as { collection: string, key: string }
  const query = getQuery(event)
  const searchQuery = (SuperJSON.parse(query.superjson as any) ?? {}) as RstoreDrizzleQueryParamsOne

  return drizzleFindOne({
    event,
    collection: params.collection,
    key: params.key,
    params,
    query,
    searchQuery,
  })
})
