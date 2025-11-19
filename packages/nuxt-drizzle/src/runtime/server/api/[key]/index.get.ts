import type { RelationalQueryBuilder } from 'drizzle-orm/pg-core/query-builders/query'
import type { RstoreDrizzleQueryParamsOne } from '../../utils'
import type { RstoreDrizzleMeta, RstoreDrizzleTransformQuery } from '../../utils/hooks'
import { and } from 'drizzle-orm'
import { defineEventHandler, getQuery, getRouterParams } from 'h3'
import SuperJSON from 'superjson'
import { getDrizzleKeyWhere, getDrizzleTableFromCollection, rstoreUseDrizzle } from '../../utils'
import { rstoreDrizzleHooks } from '../../utils/hooks'

export default defineEventHandler(async (event) => {
  const meta: RstoreDrizzleMeta = {}
  const transforms: Array<RstoreDrizzleTransformQuery> = []

  const params = getRouterParams(event) as { collection: string, key: string }
  const { collection: collectionName, key } = params
  const query = (SuperJSON.parse(getQuery(event).superjson as any) ?? {}) as RstoreDrizzleQueryParamsOne

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
    with: query.with,
    columns: query.columns,
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
