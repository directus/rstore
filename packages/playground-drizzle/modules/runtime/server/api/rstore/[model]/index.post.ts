import { and, eq, type Table } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { model: modelName } = getRouterParams(event) as { model: string }
  const { table } = getDrizzleTableFromModel(modelName)
  const body = await readBody(event)

  const q = useDrizzle().insert(table as any).values(body)

  const dialect = getDrizzleDialect()
  if (dialect === 'pg' || dialect === 'sqlite') {
    const result = await q.returning()
    return result[0]
  }
  else if (dialect === 'mysql' || dialect === 'singlestore') {
    // @ts-expect-error specific to mysql
    const result = await q.$returningId()
    const primaryKey = result[0]
    const select = await useDrizzle().select().from(table as any).where(and(
      ...Object.entries(primaryKey).map(([key, value]) => {
        return eq(table[key as keyof typeof table] as Table, value)
      }),
    )).limit(1)
    return select[0]
  }
})
