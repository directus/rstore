import type { RelationalQueryBuilder } from 'drizzle-orm/pg-core/query-builders/query'
import type { RstoreDrizzleQueryParams } from '../utils'
import type { RstoreDrizzleMeta, RstoreDrizzleTransformQuery } from '../utils/hooks'
import { and, or } from 'drizzle-orm'
import { createError, eventHandler, getQuery, getRouterParams } from 'h3'
import SuperJSON from 'superjson'
import { convertIncludeToDrizzleWith, getDrizzleCondition, getDrizzleKeyWhere, getDrizzleOrderBy, getDrizzleTableFromCollection, rstoreUseDrizzle } from '../utils'
import { rstoreDrizzleHooks } from '../utils/hooks'

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

  const withRelations = query.with ?? convertIncludeToDrizzleWith(collectionName, query.include)
  if (withRelations) {
    q.with = withRelations
  }

  if (query.columns) {
    q.columns = query.columns
  }

  q.extras = extras

  if (query.orderBy) {
    q.orderBy = getDrizzleOrderBy(table, query.orderBy)
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
