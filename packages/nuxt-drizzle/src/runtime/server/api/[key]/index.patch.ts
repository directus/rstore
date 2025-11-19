import type { RstoreDrizzleMeta, RstoreDrizzleTransformQuery } from '../../utils/hooks'
import { and } from 'drizzle-orm'
import { defineEventHandler, getQuery, getRouterParams, readRawBody } from 'h3'
import SuperJSON from 'superjson'
import { getDrizzleDialect, getDrizzleKeyWhere, getDrizzleTableFromCollection, rstoreUseDrizzle } from '../../utils'
import { rstoreDrizzleHooks } from '../../utils/hooks'

export default defineEventHandler(async (event) => {
  const meta: RstoreDrizzleMeta = {}
  const transforms: Array<RstoreDrizzleTransformQuery> = []

  const params = getRouterParams(event) as { collection: string, key: string }
  const { collection: collectionName, key } = params
  const query = getQuery(event)
  const body = SuperJSON.parse((await readRawBody(event)) ?? '') as Record<string, any>

  await rstoreDrizzleHooks.callHook('item.patch.before', {
    event,
    collection: collectionName,
    meta,
    params,
    query,
    body,
    transformQuery: (transform) => { transforms.push(transform) },
    key,
  })

  const { table, primaryKeys } = getDrizzleTableFromCollection(collectionName)

  const whereConditions: any[] = [
    getDrizzleKeyWhere(key, primaryKeys, table),
  ]

  for (const transform of transforms) {
    transform({
      where: (condition) => { whereConditions.push(condition) },
      extras: () => {},
    })
  }

  const q = rstoreUseDrizzle().update(table as any).set(body).where(and(
    ...whereConditions,
  ))

  let result: any

  const dialect = getDrizzleDialect()
  if (dialect === 'mysql' || dialect === 'singlestore') {
    await q
    const select = await rstoreUseDrizzle().select().from(table as any).where(and(
      ...whereConditions,
    )).limit(1)
    result = select[0]
  }
  else {
    const _result = await q.returning()
    result = _result[0]
  }

  await rstoreDrizzleHooks.callHook('item.patch.after', {
    event,
    collection: collectionName,
    meta,
    params,
    query,
    body,
    result,
    setResult: (r) => { result = r },
    key,
  })

  return result
})
