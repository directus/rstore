import type { Table } from 'drizzle-orm'
import type { RstoreDrizzleMeta, RstoreDrizzleTransformQuery } from '../hooks'
import type { BaseOpArgs } from './shared'
import { and, eq } from 'drizzle-orm'
import { createError } from 'h3'
import { rstoreDrizzleHooks } from '../hooks'
import {
  getDrizzleDialect,
  getDrizzleKeyWhereFromBody,
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

  const { table, primaryKeys } = getDrizzleTableFromCollection(collection)
  const q = rstoreUseDrizzle().insert(table as any).values(body)
  let result: any
  const dialect = getDrizzleDialect()
  try {
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
  }
  catch (error) {
    throw await toCreateConflictError(error, { collection, table, primaryKeys, body })
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

/**
 * Turns a failed insert into a `409 Conflict` when the body's primary key is
 * already taken, and returns the original error otherwise.
 *
 * Checked *after* the insert fails so a successful create pays nothing, and so
 * no per-driver constraint-code table (`23505`, `SQLITE_CONSTRAINT_PRIMARYKEY`,
 * `ER_DUP_ENTRY`, …) is needed. A `409` matters because an offline replay queue
 * drops permanent client errors but retries every `5xx` forever — so a create
 * whose first attempt committed but whose response was lost would otherwise
 * block the queue behind it.
 *
 * Only primary keys are covered; a collision on some other unique index still
 * surfaces as the driver error. The existence probe is guarded so that a
 * connection left unusable by the failed insert reports the original error
 * rather than masking it.
 *
 * @param error The error thrown by the insert.
 * @param context The create operation being mapped.
 * @param context.collection The collection name.
 * @param context.table The drizzle table.
 * @param context.primaryKeys The collection primary key column names.
 * @param context.body The request body.
 * @returns The error to throw.
 */
async function toCreateConflictError(error: unknown, { collection, table, primaryKeys, body }: {
  collection: string
  table: Table
  primaryKeys: string[]
  body: Record<string, any>
}) {
  const where = getDrizzleKeyWhereFromBody(body, primaryKeys, table)
  if (!where) {
    return error
  }
  const existing = await rstoreUseDrizzle().select().from(table as any).where(where).limit(1).catch(() => [])
  if (!existing.length) {
    return error
  }
  return createError({
    statusCode: 409,
    statusMessage: `Item already exists in collection ${collection}`,
  })
}
