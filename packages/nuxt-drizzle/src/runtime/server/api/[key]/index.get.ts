import type { RelationalQueryBuilder } from 'drizzle-orm/pg-core/query-builders/query'
import { defineEventHandler, getRouterParams } from 'h3'
import { getDrizzleKeyWhere, getDrizzleTableFromModel, type RstoreDrizzleQueryParamsOne, rstoreUseDrizzle } from '../../utils'

export default defineEventHandler(async (event) => {
  const { model: modelName, key } = getRouterParams(event) as { model: string, key: string }
  const query = getQuery(event) as RstoreDrizzleQueryParamsOne
  const { table, primaryKeys } = getDrizzleTableFromModel(modelName)

  const dbQuery = rstoreUseDrizzle().query as unknown as Record<string, RelationalQueryBuilder<any, any>>
  const result = await dbQuery[modelName].findFirst({
    where: getDrizzleKeyWhere(key, primaryKeys, table),
    with: query.with ? JSON.parse(query.with) : undefined,
    columns: query.columns ? JSON.parse(query.columns) : undefined,
  })
  return result ?? null
})
