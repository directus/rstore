import { createError, eventHandler, getQuery, getRouterParams } from 'h3'
import { getDrizzleCondition, getDrizzleTableFromModel, type RstoreDrizzleQueryParams, rstoreUseDrizzle } from '../utils'

export default eventHandler(async (event) => {
  const { model: modelName } = getRouterParams(event) as { model: string }
  const { table } = getDrizzleTableFromModel(modelName)

  const query = getQuery(event) as RstoreDrizzleQueryParams

  const q = rstoreUseDrizzle().select().from(table as any)

  if (query.where) {
    try {
      const where = JSON.parse(query.where as string) as any
      if (where) {
        const condition = getDrizzleCondition(table, where)
        q.where(condition)
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
    q.limit(Number.parseInt(query.limit))
  }

  if (query.offset != null) {
    q.offset(Number.parseInt(query.offset))
  }

  return q.$dynamic()
})
