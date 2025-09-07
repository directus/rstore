import { and } from 'drizzle-orm'
import { defineEventHandler, getRouterParams, readBody } from 'h3'
import { getDrizzleDialect, getDrizzleKeyWhere, getDrizzleTableFromModel, rstoreUseDrizzle } from '../../utils'
import { rstoreDrizzleHooks, type RstoreDrizzleMeta, type RstoreDrizzleTransformQuery } from '../../utils/hooks'

export default defineEventHandler(async (event) => {
  const meta: RstoreDrizzleMeta = {}
  const transforms: Array<RstoreDrizzleTransformQuery> = []

  const params = getRouterParams(event) as { model: string, key: string }
  const { model: modelName, key } = params
  const query = getQuery(event)
  const body = await readBody(event)

  await rstoreDrizzleHooks.callHook('item.patch.before', {
    event,
    model: modelName,
    meta,
    params,
    query,
    body,
    transformQuery: (transform) => { transforms.push(transform) },
  })

  const { table, primaryKeys } = getDrizzleTableFromModel(modelName)

  const where: any[] = [
    getDrizzleKeyWhere(key, primaryKeys, table),
  ]

  for (const transform of transforms) {
    transform({
      where: (condition) => { where.push(condition) },
    })
  }

  const q = rstoreUseDrizzle().update(table as any).set(body).where(and(
    ...where,
  ))

  let result: any

  const dialect = getDrizzleDialect()
  if (dialect === 'pg' || dialect === 'sqlite') {
    const _result = await q.returning()
    result = _result[0]
  }
  else {
    await q
    const select = await rstoreUseDrizzle().select().from(table as any).where(and(
      ...where,
    )).limit(1)
    result = select[0]
  }

  await rstoreDrizzleHooks.callHook('item.patch.after', {
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
