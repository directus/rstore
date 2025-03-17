import { drizzle } from 'drizzle-orm/d1'

import * as schema from '../database/schema'

export const tables = schema

export function useDrizzle() {
  return drizzle(hubDatabase(), {
    schema,
    casing: 'snake_case',
  })
}

// export type User = typeof schema.users.$inferSelect
// export type Post = typeof schema.posts.$inferSelect
// export type Comment = typeof schema.comments.$inferSelect
