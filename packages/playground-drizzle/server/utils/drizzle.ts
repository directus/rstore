import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../database/schema'

export const tables = schema

let drizzleInstance

export function useDrizzle() {
  drizzleInstance ??= drizzle({
    schema,
    connection: useRuntimeConfig().dbUrl,
  })
  return drizzleInstance
}
