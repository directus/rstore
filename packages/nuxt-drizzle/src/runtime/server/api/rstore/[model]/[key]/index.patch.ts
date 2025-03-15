export default defineEventHandler(async (event) => {
  const { model: modelName, key } = getRouterParams(event) as { model: string, key: string }
  const { table, primaryKeys } = getDrizzleTableFromModel(modelName)
  const body = await readBody(event)

  const where = getDrizzleKeyWhere(key, primaryKeys, table)
  const q = rstoreUseDrizzle().update(table as any).set(body).where(where)

  const dialect = getDrizzleDialect()
  if (dialect === 'pg' || dialect === 'sqlite') {
    const result = await q.returning()
    return result[0]
  }
  else {
    await q
    const select = await rstoreUseDrizzle().select().from(table as any).where(where).limit(1)
    return select[0]
  }
})
