import type { RelationalQueryBuilder } from 'drizzle-orm/pg-core/query-builders/query'
import { and } from 'drizzle-orm'
import { defineEventHandler, getQuery, getRouterParams } from 'h3'
import { getDrizzleKeyWhere, getDrizzleTableFromModel, type RstoreDrizzleQueryParamsOne, rstoreUseDrizzle } from '../../utils'
import { rstoreDrizzleHooks, type RstoreDrizzleMeta, type RstoreDrizzleTransformQuery } from '../../utils/hooks'

export default defineEventHandler(async (event) => {
  const meta: RstoreDrizzleMeta = {}
  const transforms: Array<RstoreDrizzleTransformQuery> = []

  const params = getRouterParams(event) as { model: string, key: string }
  const { model: modelName, key } = params
  const query = getQuery(event) as RstoreDrizzleQueryParamsOne

  await rstoreDrizzleHooks.callHook('item.get.before', {
    event,
    model: modelName,
    meta,
    params,
    query: query as Record<string, string | string[]>,
    transformQuery: (transform) => { transforms.push(transform) },
  })

  const { table, primaryKeys } = getDrizzleTableFromModel(modelName)

  const where: any[] = []
  for (const transform of transforms) {
    transform({
      where: (condition) => { where.push(condition) },
    })
  }

  const dbQuery = rstoreUseDrizzle().query as unknown as Record<string, RelationalQueryBuilder<any, any>>
  let result: any = await dbQuery[modelName].findFirst({
    where: and(
      getDrizzleKeyWhere(key, primaryKeys, table),
      ...where,
    ),
    with: query.with ? JSON.parse(query.with) : undefined,
    columns: query.columns ? JSON.parse(query.columns) : undefined,
  })

  result ??= null

  await rstoreDrizzleHooks.callHook('item.get.after', {
    event,
    model: modelName,
    meta,
    params,
    query: query as Record<string, string | string[]>,
    result,
    setResult: (r) => { result = r },
  })

  return result
})
