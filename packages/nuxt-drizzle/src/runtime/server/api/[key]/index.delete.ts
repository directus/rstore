import { and } from 'drizzle-orm'
import { defineEventHandler, getQuery, getRouterParams } from 'h3'
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

  const whereConditions: any[] = [
    getDrizzleKeyWhere(key, primaryKeys, table),
  ]

  for (const transform of transforms) {
    transform({
      where: (condition) => { whereConditions.push(condition) },
    })
  }

  await rstoreUseDrizzle().delete(table as any).where(and(
    ...whereConditions,
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
