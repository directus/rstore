import { and } from 'drizzle-orm'
import { defineEventHandler, getRouterParams } from 'h3'
import { getDrizzleKeyWhere, getDrizzleTableFromModel, rstoreUseDrizzle } from '../../utils'
import { rstoreDrizzleHooks, type RstoreDrizzleMeta, type RstoreDrizzleTransformQuery } from '../../utils/hooks'

export default defineEventHandler(async (event) => {
  const meta: RstoreDrizzleMeta = {}
  const transforms: Array<RstoreDrizzleTransformQuery> = []

  const params = getRouterParams(event) as { model: string, key: string }
  const { model: modelName, key } = params
  const query = getQuery(event)

  await rstoreDrizzleHooks.callHook('item.delete.before', {
    event,
    model: modelName,
    meta,
    params,
    query,
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

  await rstoreUseDrizzle().delete(table as any).where(and(
    ...where,
  ))

  let result: any = null

  await rstoreDrizzleHooks.callHook('item.delete.after', {
    event,
    model: modelName,
    meta,
    params,
    query,
    result,
    setResult: (r) => { result = r },
  })

  return result
})
