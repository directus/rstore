import type { RelationalQueryBuilder } from 'drizzle-orm/pg-core/query-builders/query'
import type { RstoreDrizzleMeta, RstoreDrizzleTransformQuery } from '../hooks'
import type { RstoreDrizzleQueryParams } from '../index'
import type { BaseOpArgs } from './shared'
import { and, or } from 'drizzle-orm'
import { createError } from 'h3'
import { rstoreDrizzleHooks } from '../hooks'
import {
  convertIncludeToDrizzleWith,
  getDrizzleCondition,
  getDrizzleKeyWhere,
  getDrizzleOrderBy,
  getDrizzleTableFromCollection,
  rstoreUseDrizzle,
} from '../index'
import { applyTransforms } from './shared'

/**
 * `GET /:collection` — list query. Handles `keys`, `where`, pagination,
 * relations, column selection and ordering.
 */
export async function drizzleFindMany({ event, collection, params, query, searchQuery }: BaseOpArgs & { searchQuery: RstoreDrizzleQueryParams }) {
  const meta: RstoreDrizzleMeta = {}
  const transforms: RstoreDrizzleTransformQuery[] = []

  await rstoreDrizzleHooks.callHook('index.get.before', {
    event,
    collection,
    meta,
    params,
    query: (query ?? {}) as Record<string, string | string[]>,
    transformQuery: transform => transforms.push(transform),
  })

  const { table, primaryKeys } = getDrizzleTableFromCollection(collection)
  const dbQuery = rstoreUseDrizzle().query as unknown as Record<string, RelationalQueryBuilder<any, any>>
  const q = {} as NonNullable<Parameters<typeof dbQuery[string]['findMany']>[0]>
  const whereConditions: any[] = []

  if (searchQuery.keys) {
    const keyConditions = searchQuery.keys.map(k => getDrizzleKeyWhere(String(k), primaryKeys, table))
    whereConditions.push(or(...keyConditions))
  }

  if (searchQuery.where) {
    try {
      whereConditions.push(getDrizzleCondition(table, searchQuery.where))
    }
    catch (e) {
      console.error(e)
      throw createError({ statusCode: 400, statusMessage: 'Invalid filter' })
    }
  }

  const extras: Record<string, any> = {}
  applyTransforms(transforms, whereConditions, extras)

  q.where = whereConditions.length ? and(...whereConditions) : undefined
  if (searchQuery.limit != null)
    q.limit = searchQuery.limit
  if (searchQuery.offset != null)
    q.offset = searchQuery.offset

  const withRelations = searchQuery.with ?? convertIncludeToDrizzleWith(collection, searchQuery.include)
  if (withRelations)
    q.with = withRelations
  if (searchQuery.columns)
    q.columns = searchQuery.columns
  q.extras = extras
  if (searchQuery.orderBy)
    q.orderBy = getDrizzleOrderBy(table, searchQuery.orderBy)

  let result = await dbQuery[collection]!.findMany(q)
  result ??= []

  await rstoreDrizzleHooks.callHook('index.get.after', {
    event,
    collection,
    meta,
    params,
    query: (query ?? {}) as Record<string, string | string[]>,
    result,
    setResult: (r: any) => { result = r },
  })

  return result
}
