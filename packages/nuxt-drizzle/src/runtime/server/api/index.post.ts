import { defineEventHandler, getQuery, getRouterParams, readRawBody } from 'h3'
import SuperJSON from 'superjson'
import { drizzleCreate } from '../utils/operations'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event) as { collection: string }
  const body = SuperJSON.parse((await readRawBody(event, 'utf-8') ?? '')) as Record<string, any>
  const query = getQuery(event)

  return drizzleCreate({
    event,
    collection: params.collection,
    params,
    query,
    body,
  })
})
