export default defineEventHandler(async (event) => {
  const { model: modelName, key } = getRouterParams(event) as { model: string, key: string }
  const { table, primaryKeys } = getDrizzleTableFromModel(modelName)

  await useDrizzle().delete(table as any).where(getDrizzleKeyWhere(key, primaryKeys, table))
})
