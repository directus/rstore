import type { RelationalQueryBuilder } from 'drizzle-orm/pg-core/query-builders/query'
import { asc, desc } from 'drizzle-orm'
import { createError, eventHandler, getQuery, getRouterParams } from 'h3'
import { getDrizzleCondition, getDrizzleTableFromModel, type RstoreDrizzleQueryParams, rstoreUseDrizzle } from '../utils'

const orderByOperators = {
  asc,
  desc,
}

export default eventHandler(async (event) => {
  const { model: modelName } = getRouterParams(event) as { model: string }
  const { table } = getDrizzleTableFromModel(modelName)

  const query = getQuery(event) as RstoreDrizzleQueryParams

  const dbQuery = rstoreUseDrizzle().query as unknown as Record<string, RelationalQueryBuilder<any, any>>

  const q = {} as NonNullable<Parameters<typeof dbQuery[typeof modelName]['findMany']>[0]>

  if (query.where) {
    try {
      const where = JSON.parse(query.where as string) as any
      if (where) {
        const condition = getDrizzleCondition(table, where)
        q.where = condition
      }
    }
    catch (e) {
      console.error(e)
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid filter',
      })
    }
  }

  if (query.limit != null) {
    q.limit = Number.parseInt(query.limit)
  }

  if (query.offset != null) {
    q.offset = Number.parseInt(query.offset)
  }

  if (query.with) {
    q.with = JSON.parse(query.with)
  }

  if (query.columns) {
    q.columns = JSON.parse(query.columns)
  }

  if (query.orderBy) {
    const orderByData = typeof query.orderBy === 'string' ? [query.orderBy] : query.orderBy as Array<`${string}.${string}.${'asc' | 'desc'}`>
    const orderBy = []
    for (const rawOrderBy of orderByData) {
      const parts = rawOrderBy.split('.')
      let columnName: string
      let order: 'asc' | 'desc'
      if (parts.length === 2) {
        columnName = parts[0]
        order = parts[1] as 'asc' | 'desc'
      }
      else {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid orderBy',
        })
      }
      const operator = orderByOperators[order as 'asc' | 'desc']
      orderBy.push(operator((table as any)[columnName]))
    }
    q.orderBy = orderBy
  }

  const result = await dbQuery[modelName].findMany(q)
  return result ?? []
})
