import type { StoreSchema } from '@rstore/shared'
import { createVueStack } from '../../../../test/utils/store/vueStack'
import { createDirectusRstorePlugin } from '../../src'
import { createMockDirectusClient } from './plugin'

/** Creates real store/cache with only Directus SDK requests substituted. */
export async function createDirectusStack(schema: StoreSchema) {
  const client = createMockDirectusClient()
  const { store } = await createVueStack({
    schema,
    remote: false,
    plugins: [createDirectusRstorePlugin({ client: client as any })],
  })
  return { store, client }
}
