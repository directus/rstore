import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../database/schema'

let drizzleInstance

export function useDrizzle() {
  drizzleInstance ??= drizzle({
    schema,
    connection: useRuntimeConfig().dbUrl,
  })
  return drizzleInstance
}
