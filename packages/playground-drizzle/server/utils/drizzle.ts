import { drizzle } from 'drizzle-orm/libsql'

let drizzleInstance

export function useDrizzle() {
  drizzleInstance ??= drizzle(useRuntimeConfig().dbUrl)
  return drizzleInstance
}
