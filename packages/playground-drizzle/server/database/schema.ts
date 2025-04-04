import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const todos = sqliteTable('todos', {
  id: integer().primaryKey({ autoIncrement: true }),
  title: text().notNull(),
  completed: integer()
    .notNull()
    .$defaultFn(() => 0),
  createdAt: integer({ mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }),
})
