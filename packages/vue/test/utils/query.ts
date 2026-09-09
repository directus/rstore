import type { StoreSchema } from '@rstore/shared'
import { createVueStack } from '#test-utils/store/vueStack'

/**
 * Creates the store of one test, which tears itself down when the test ends.
 *
 * @param schema Collections of the store.
 * @param options Extra store options, e.g. `syncImmediately`.
 */
export function setup(schema: StoreSchema, options: Record<string, any> = {}) {
  return createVueStack({ schema, remote: false, ...options })
}
