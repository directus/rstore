import type { RelationalQueryBuilder } from 'drizzle-orm/pg-core/query-builders/query'
import { and } from 'drizzle-orm'
import { defineEventHandler, getQuery, getRouterParams } from 'h3'
import { getDrizzleKeyWhere, getDrizzleTableFromCollection, type RstoreDrizzleQueryParamsOne, rstoreUseDrizzle } from '../../utils'
import { rstoreDrizzleHooks, type RstoreDrizzleMeta, type RstoreDrizzleTransformQuery } from '../../utils/hooks'

export default defineEventHandler(async (event) => {
  const meta: RstoreDrizzleMeta = {}
  const transforms: Array<RstoreDrizzleTransformQuery> = []

  const params = getRouterParams(event) as { collection: string, key: string }
  const { collection: collectionName, key } = params
  const query = getQuery(event) as RstoreDrizzleQueryParamsOne

  await rstoreDrizzleHooks.callHook('item.get.before', {
    event,
    collection: collectionName,
    meta,
    params,
    query: query as Record<string, string | string[]>,
    transformQuery: (transform) => { transforms.push(transform) },
    key,
  })

  const { table, primaryKeys } = getDrizzleTableFromCollection(collectionName)

  const whereConditions: any[] = []

  const extras: Record<string, any> = {}

  for (const transform of transforms) {
    transform({
      where: (condition) => { whereConditions.push(condition) },
      extras: e => Object.assign(extras, e),
    })
  }

  const dbQuery = rstoreUseDrizzle().query as unknown as Record<string, RelationalQueryBuilder<any, any>>
  let result: any = await dbQuery[collectionName]!.findFirst({
    where: and(
      getDrizzleKeyWhere(key, primaryKeys, table),
      ...whereConditions,
    ),
    with: query.with ? JSON.parse(query.with) : undefined,
    columns: query.columns ? JSON.parse(query.columns) : undefined,
    extras,
  })

  result ??= null

  await rstoreDrizzleHooks.callHook('item.get.after', {
    event,
    collection: collectionName,
    meta,
    params,
    query: query as Record<string, string | string[]>,
    result,
    setResult: (r) => { result = r },
    key,
  })

  return result
})
