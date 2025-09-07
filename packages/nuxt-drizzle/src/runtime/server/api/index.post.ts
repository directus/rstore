import { and, eq, type Table } from 'drizzle-orm'
import { defineEventHandler, getQuery, getRouterParams, readBody } from 'h3'
import { getDrizzleDialect, getDrizzleTableFromModel, rstoreUseDrizzle } from '../utils'
import { rstoreDrizzleHooks, type RstoreDrizzleMeta, type RstoreDrizzleTransformQuery } from '../utils/hooks'

export default defineEventHandler(async (event) => {
  const meta: RstoreDrizzleMeta = {}
  const transforms: Array<RstoreDrizzleTransformQuery> = []

  const params = getRouterParams(event) as { model: string }
  const { model: modelName } = params
  const body = await readBody(event)
  const query = getQuery(event)

  await rstoreDrizzleHooks.callHook('index.post.before', {
    event,
    model: modelName,
    meta,
    params,
    query,
    body,
    transformQuery: (transform) => { transforms.push(transform) },
  })

  const { table } = getDrizzleTableFromModel(modelName)

  const q = rstoreUseDrizzle().insert(table as any).values(body)

  let result: any

  const dialect = getDrizzleDialect()
  if (dialect === 'pg' || dialect === 'sqlite') {
    const _result = await q.returning()
    result = _result[0]
  }
  else if (dialect === 'mysql' || dialect === 'singlestore') {
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

  await rstoreDrizzleHooks.callHook('index.post.after', {
    event,
    model: modelName,
    meta,
    params,
    query,
    body,
    result,
    setResult: (r) => { result = r },
  })

  return result
})
