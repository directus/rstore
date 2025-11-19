import type { Table } from 'drizzle-orm'
import type { RstoreDrizzleMeta, RstoreDrizzleTransformQuery } from '../utils/hooks'
import { and, eq } from 'drizzle-orm'
import { defineEventHandler, getQuery, getRouterParams, readRawBody } from 'h3'
import SuperJSON from 'superjson'
import { getDrizzleDialect, getDrizzleTableFromCollection, rstoreUseDrizzle } from '../utils'
import { rstoreDrizzleHooks } from '../utils/hooks'

export default defineEventHandler(async (event) => {
  const meta: RstoreDrizzleMeta = {}
  const transforms: Array<RstoreDrizzleTransformQuery> = []

  const params = getRouterParams(event) as { collection: string }
  const { collection: collectionName } = params
  const body = SuperJSON.parse((await readRawBody(event, 'utf-8') ?? '')) as Record<string, any>
  const query = getQuery(event)

  await rstoreDrizzleHooks.callHook('index.post.before', {
    event,
    collection: collectionName,
    meta,
    params,
    query,
    body,
    transformQuery: (transform) => { transforms.push(transform) },
  })

  const { table } = getDrizzleTableFromCollection(collectionName)

  const q = rstoreUseDrizzle().insert(table as any).values(body)

  let result: any

  const dialect = getDrizzleDialect()
  if (dialect === 'mysql' || dialect === 'singlestore') {
    // @ts-expect-error specific to mysql
    const _result = await q.$returningId()
    const primaryKey = _result[0]
    const select = await rstoreUseDrizzle().select().from(table as any).where(and(
      ...Object.entries(primaryKey).map(([key, value]) => {
        return eq(table[key as keyof typeof table] as Table, value)
      }),
    )).limit(1)
    result = select[0]
  }
  else {
    const _result = await q.returning()
    result = _result[0]
  }

  await rstoreDrizzleHooks.callHook('index.post.after', {
    event,
    collection: collectionName,
    meta,
    params,
    query,
    body,
    result,
    setResult: (r) => { result = r },
  })

  return result
})
