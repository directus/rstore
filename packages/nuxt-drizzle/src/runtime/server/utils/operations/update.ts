import type { RelationalQueryBuilder } from 'drizzle-orm/pg-core/query-builders/query'
import type { RstoreDrizzleMeta, RstoreDrizzleTransformQuery } from '../hooks'
import type { BaseOpArgs } from './shared'
import { and } from 'drizzle-orm'
import { rstoreDrizzleHooks } from '../hooks'
import {
  getDrizzleDialect,
  getDrizzleKeyWhere,
  getDrizzleTableFromCollection,
  rstoreUseDrizzle,
} from '../index'

/**
 * `PATCH /:collection/:key` — update a row by primary key. Mirrors the
 * create helper's dialect-specific re-read fallback for mysql/singlestore.
 */
export async function drizzleUpdate({ event, collection, key, body, params, query }: BaseOpArgs & { key: string, body: Record<string, any> }) {
  const meta: RstoreDrizzleMeta = {}
  const transforms: RstoreDrizzleTransformQuery[] = []

  await rstoreDrizzleHooks.callHook('item.patch.before', {
    event,
    collection,
    meta,
    params,
    query,
    body,
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

  // Read the pre-image so the realtime publisher can match subscriptions
  // whose `where` filter accepted the record *before* this update (the
  // record may be leaving the filter and subscribers must be told).
  const dbQuery = db.query as unknown as Record<string, RelationalQueryBuilder<any, any>>
  const previousRecord: any = await dbQuery[collection]!.findFirst({
    where: and(...whereConditions),
  })

  const q = db.update(table as any).set(body).where(and(...whereConditions))
  let result: any
  const dialect = getDrizzleDialect()
  if (dialect === 'mysql' || dialect === 'singlestore') {
    await q
    const select = await db.select().from(table as any).where(and(...whereConditions)).limit(1)
    result = select[0]
  }
  else {
    const _result = await q.returning()
    result = _result[0]
  }

  await rstoreDrizzleHooks.callHook('item.patch.after', {
    event,
    collection,
    meta,
    params,
    query,
    body,
    result,
    previousRecord,
    setResult: (r: any) => { result = r },
    key,
  })

  return result
}
