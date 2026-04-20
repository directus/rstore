import type { RelationalQueryBuilder } from 'drizzle-orm/pg-core/query-builders/query'
import type { RstoreDrizzleMeta, RstoreDrizzleTransformQuery } from '../hooks'
import type { RstoreDrizzleQueryParamsOne } from '../index'
import type { BaseOpArgs } from './shared'
import { and } from 'drizzle-orm'
import { rstoreDrizzleHooks } from '../hooks'
import {
  convertIncludeToDrizzleWith,
  getDrizzleKeyWhere,
  getDrizzleTableFromCollection,
  rstoreUseDrizzle,
} from '../index'
import { applyTransforms } from './shared'

/**
 * `GET /:collection/:key` — single item lookup by primary key.
 * Returns `null` when no row matches.
 */
export async function drizzleFindOne({ event, collection, key, params, query, searchQuery }: BaseOpArgs & { key: string, searchQuery: RstoreDrizzleQueryParamsOne }) {
  const meta: RstoreDrizzleMeta = {}
  const transforms: RstoreDrizzleTransformQuery[] = []

  await rstoreDrizzleHooks.callHook('item.get.before', {
    event,
    collection,
    meta,
    params,
    query: (query ?? {}) as Record<string, string | string[]>,
    transformQuery: transform => transforms.push(transform),
    key,
  })

  const { table, primaryKeys } = getDrizzleTableFromCollection(collection)
  const whereConditions: any[] = []
  const extras: Record<string, any> = {}
  applyTransforms(transforms, whereConditions, extras)

  const dbQuery = rstoreUseDrizzle().query as unknown as Record<string, RelationalQueryBuilder<any, any>>
  const withRelations = searchQuery.with ?? convertIncludeToDrizzleWith(collection, searchQuery.include)

  let result: any = await dbQuery[collection]!.findFirst({
    where: and(getDrizzleKeyWhere(key, primaryKeys, table), ...whereConditions),
    with: withRelations,
    columns: searchQuery.columns,
    extras,
  })
  result ??= null

  await rstoreDrizzleHooks.callHook('item.get.after', {
    event,
    collection,
    meta,
    params,
    query: (query ?? {}) as Record<string, string | string[]>,
    result,
    setResult: (r: any) => { result = r },
    key,
  })

  return result
}
