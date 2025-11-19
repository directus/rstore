import type { RelationalQueryBuilder } from 'drizzle-orm/pg-core/query-builders/query'
import type { RstoreDrizzleMeta, RstoreDrizzleTransformQuery } from '../../utils/hooks'
import { and } from 'drizzle-orm'
import { defineEventHandler, getQuery, getRouterParams } from 'h3'
import { getDrizzleKeyWhere, getDrizzleTableFromCollection, rstoreUseDrizzle } from '../../utils'
import { rstoreDrizzleHooks } from '../../utils/hooks'

export default defineEventHandler(async (event) => {
  const meta: RstoreDrizzleMeta = {}
  const transforms: Array<RstoreDrizzleTransformQuery> = []

  const params = getRouterParams(event) as { collection: string, key: string }
  const { collection: collectionName, key } = params
  const query = getQuery(event)

  await rstoreDrizzleHooks.callHook('item.delete.before', {
    event,
    collection: collectionName,
    meta,
    params,
    query,
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

  const db = rstoreUseDrizzle()

  const dbQuery = db.query as unknown as Record<string, RelationalQueryBuilder<any, any>>
  let result: any = await dbQuery[collectionName]!.findFirst({
    where: and(
      ...whereConditions,
    ),
  })

  await db.delete(table as any).where(and(
    ...whereConditions,
  ))

  await rstoreDrizzleHooks.callHook('item.delete.after', {
    event,
    collection: collectionName,
    meta,
    params,
    query,
    result,
    setResult: (r) => { result = r },
    key,
  })

  return result
})
