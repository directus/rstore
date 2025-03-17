import { defineEventHandler, getRouterParams } from 'h3'
import { getDrizzleKeyWhere, getDrizzleTableFromModel, rstoreUseDrizzle } from '../../utils'

export default defineEventHandler(async (event) => {
  const { model: modelName, key } = getRouterParams(event) as { model: string, key: string }
  const { table, primaryKeys } = getDrizzleTableFromModel(modelName)

  const result = await rstoreUseDrizzle().select().from(table as any).where(getDrizzleKeyWhere(key, primaryKeys, table))
  return result?.[0] ?? null
})
