import type { Table } from 'drizzle-orm'
import type { RstoreDrizzleMeta, RstoreDrizzleTransformQuery } from '../hooks'
import type { BaseOpArgs } from './shared'
import { and, eq } from 'drizzle-orm'
import { rstoreDrizzleHooks } from '../hooks'
import {
  getDrizzleDialect,
  getDrizzleTableFromCollection,
  rstoreUseDrizzle,
} from '../index'

/**
 * `POST /:collection` — insert a row. Returns the full inserted row.
 * On mysql/singlestore a follow-up `SELECT` is used to fetch the row
 * because those dialects can't `RETURNING` directly.
 */
export async function drizzleCreate({ event, collection, body, params, query }: BaseOpArgs & { body: Record<string, any> }) {
  const meta: RstoreDrizzleMeta = {}
  const transforms: RstoreDrizzleTransformQuery[] = []

  await rstoreDrizzleHooks.callHook('index.post.before', {
    event,
    collection,
    meta,
    params,
    query,
    body,
    transformQuery: transform => transforms.push(transform),
  })

  const { table } = getDrizzleTableFromCollection(collection)
  const q = rstoreUseDrizzle().insert(table as any).values(body)
  let result: any
  const dialect = getDrizzleDialect()
  if (dialect === 'mysql' || dialect === 'singlestore') {
    // @ts-expect-error specific to mysql
    const _result = await q.$returningId()
    const primaryKey = _result[0]
    const select = await rstoreUseDrizzle().select().from(table as any).where(and(
      ...Object.entries(primaryKey).map(([k, v]) => eq(table[k as keyof typeof table] as Table, v)),
    )).limit(1)
    result = select[0]
  }
  else {
    const _result = await q.returning()
    result = _result[0]
  }

  await rstoreDrizzleHooks.callHook('index.post.after', {
    event,
    collection,
    meta,
    params,
    query,
    body,
    result,
    setResult: (r: any) => { result = r },
  })

  return result
}
