import { defineEventHandler, getQuery, getRouterParams, readRawBody } from 'h3'
import SuperJSON from 'superjson'
import { drizzleUpdate } from '../../utils/operations'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event) as { collection: string, key: string }
  const query = getQuery(event)
  const body = SuperJSON.parse((await readRawBody(event)) ?? '') as Record<string, any>

  return drizzleUpdate({
    event,
    collection: params.collection,
    key: params.key,
    params,
    query,
    body,
  })
})
