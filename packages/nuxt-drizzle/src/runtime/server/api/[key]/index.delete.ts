import { defineEventHandler, getRouterParams } from 'h3'
import { getDrizzleKeyWhere, getDrizzleTableFromModel, rstoreUseDrizzle } from '../../utils'

export default defineEventHandler(async (event) => {
  const { model: modelName, key } = getRouterParams(event) as { model: string, key: string }
  const { table, primaryKeys } = getDrizzleTableFromModel(modelName)

  await rstoreUseDrizzle().delete(table as any).where(getDrizzleKeyWhere(key, primaryKeys, table))
})
