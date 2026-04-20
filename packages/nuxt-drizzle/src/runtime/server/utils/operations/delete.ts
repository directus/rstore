import type { RelationalQueryBuilder } from 'drizzle-orm/pg-core/query-builders/query'
import type { RstoreDrizzleMeta, RstoreDrizzleTransformQuery } from '../hooks'
import type { BaseOpArgs } from './shared'
import { and } from 'drizzle-orm'
import { rstoreDrizzleHooks } from '../hooks'
import {
  getDrizzleKeyWhere,
  getDrizzleTableFromCollection,
  rstoreUseDrizzle,
} from '../index'

/**
 * `DELETE /:collection/:key` — delete a row by primary key. Reads the row
 * first so the `after` hook / realtime publisher receive the deleted record.
 */
export async function drizzleDelete({ event, collection, key, params, query }: BaseOpArgs & { key: string }) {
  const meta: RstoreDrizzleMeta = {}
  const transforms: RstoreDrizzleTransformQuery[] = []

  await rstoreDrizzleHooks.callHook('item.delete.before', {
    event,
    collection,
    meta,
    params,
    query,
    transformQuery: transform => transforms.push(transform),
    key,
  })

  const { table, primaryKeys } = getDrizzleTableFromCollection(collection)
  const whereConditions: any[] = [getDrizzleKeyWhere(key, primaryKeys, table)]
  for (const transform of transforms) {
    transform({
      where: condition => whereConditions.push(condition),
      extras: () => {},
    })
  }

  const db = rstoreUseDrizzle()
  const dbQuery = db.query as unknown as Record<string, RelationalQueryBuilder<any, any>>
  let result: any = await dbQuery[collection]!.findFirst({
    where: and(...whereConditions),
  })

  await db.delete(table as any).where(and(...whereConditions))

  await rstoreDrizzleHooks.callHook('item.delete.after', {
    event,
    collection,
    meta,
    params,
    query,
    result,
    setResult: (r: any) => { result = r },
    key,
  })

  return result
}
