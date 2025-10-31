import type { RelationalQueryBuilder } from 'drizzle-orm/pg-core/query-builders/query'
import { and, asc, desc, or, sql } from 'drizzle-orm'
import { createError, eventHandler, getQuery, getRouterParams } from 'h3'
import SuperJSON from 'superjson'
import { getDrizzleCondition, getDrizzleKeyWhere, getDrizzleTableFromCollection, type RstoreDrizzleQueryParams, rstoreUseDrizzle } from '../utils'
import { rstoreDrizzleHooks, type RstoreDrizzleMeta, type RstoreDrizzleTransformQuery } from '../utils/hooks'

const orderByOperators = {
  asc,
  desc,
}

export default eventHandler(async (event) => {
  const meta: RstoreDrizzleMeta = {}
  const transforms: Array<RstoreDrizzleTransformQuery> = []

  const params = getRouterParams(event) as { collection: string }
  const { collection: collectionName } = params
  const query = (SuperJSON.parse(getQuery(event).superjson as any) ?? {}) as RstoreDrizzleQueryParams

  await rstoreDrizzleHooks.callHook('index.get.before', {
    event,
    collection: collectionName,
    meta,
    params,
    query: query as Record<string, string | string[]>,
    transformQuery: (transform) => { transforms.push(transform) },
  })

  const { table, primaryKeys } = getDrizzleTableFromCollection(collectionName)

  const dbQuery = rstoreUseDrizzle().query as unknown as Record<string, RelationalQueryBuilder<any, any>>

  const q = {} as NonNullable<Parameters<typeof dbQuery[typeof collectionName]['findMany']>[0]>

  const whereConditions: any[] = []

  if (query.keys) {
    const keyConditions = query.keys.map(key => getDrizzleKeyWhere(String(key), primaryKeys, table))
    whereConditions.push(or(...keyConditions))
  }

  if (query.where) {
    try {
      const where = query.where
      if (where) {
        const condition = getDrizzleCondition(table, where)
        whereConditions.push(condition)
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

  const extras: Record<string, any> = {}

  for (const transform of transforms) {
    transform({
      where: (condition) => { whereConditions.push(condition) },
      extras: e => Object.assign(extras, e),
    })
  }

  q.where = whereConditions.length ? and(...whereConditions) : undefined

  if (query.limit != null) {
    q.limit = query.limit
  }

  if (query.offset != null) {
    q.offset = query.offset
  }

  if (query.with) {
    q.with = query.with
  }

  if (query.columns) {
    q.columns = query.columns
  }

  q.extras = extras

  if (query.orderBy) {
    const orderByData = typeof query.orderBy === 'string' ? [query.orderBy] : query.orderBy as Array<`${string}.${string}.${'asc' | 'desc'}`>
    const orderBy = []
    for (const rawOrderBy of orderByData) {
      const parts = rawOrderBy.split('.')
      if (parts.length !== 2) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid orderBy',
        })
      }
      const [columnName, order] = parts
      const operator = orderByOperators[order as 'asc' | 'desc']
      orderBy.push(operator((table as any)[columnName!] ?? sql`${columnName}`.as(columnName!)))
    }
    q.orderBy = orderBy
  }

  let result = await dbQuery[collectionName]!.findMany(q)
  result ??= []

  await rstoreDrizzleHooks.callHook('index.get.after', {
    event,
    collection: collectionName,
    meta,
    params,
    query: query as Record<string, string | string[]>,
    result,
    setResult: (r) => { result = r },
  })

  return result
})
