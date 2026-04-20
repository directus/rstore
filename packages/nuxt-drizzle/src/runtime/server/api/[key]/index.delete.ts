import { defineEventHandler, getQuery, getRouterParams } from 'h3'
import { drizzleDelete } from '../../utils/operations'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event) as { collection: string, key: string }
  const query = getQuery(event)

  return drizzleDelete({
    event,
    collection: params.collection,
    key: params.key,
    params,
    query,
  })
})
