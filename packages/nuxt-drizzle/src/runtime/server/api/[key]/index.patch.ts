import { and } from 'drizzle-orm'
import { defineEventHandler, getQuery, getRouterParams, readBody } from 'h3'
import { getDrizzleDialect, getDrizzleKeyWhere, getDrizzleTableFromCollection, rstoreUseDrizzle } from '../../utils'
import { rstoreDrizzleHooks, type RstoreDrizzleMeta, type RstoreDrizzleTransformQuery } from '../../utils/hooks'

export default defineEventHandler(async (event) => {
  const meta: RstoreDrizzleMeta = {}
  const transforms: Array<RstoreDrizzleTransformQuery> = []

  const params = getRouterParams(event) as { collection: string, key: string }
  const { collection: collectionName, key } = params
  const query = getQuery(event)
  const body = await readBody(event)

  await rstoreDrizzleHooks.callHook('item.patch.before', {
    event,
    collection: collectionName,
    meta,
    params,
    query,
    body,
    transformQuery: (transform) => { transforms.push(transform) },
  })

  const { table, primaryKeys } = getDrizzleTableFromCollection(collectionName)

  const whereConditions: any[] = [
    getDrizzleKeyWhere(key, primaryKeys, table),
  ]

  for (const transform of transforms) {
    transform({
      where: (condition) => { whereConditions.push(condition) },
    })
  }

  const q = rstoreUseDrizzle().update(table as any).set(body).where(and(
    ...whereConditions,
  ))

  let result: any

  const dialect = getDrizzleDialect()
  if (dialect === 'pg' || dialect === 'sqlite') {
    const _result = await q.returning()
    result = _result[0]
  }
  else {
    await q
    const select = await rstoreUseDrizzle().select().from(table as any).where(and(
      ...whereConditions,
    )).limit(1)
    result = select[0]
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
  })

  return result
})
