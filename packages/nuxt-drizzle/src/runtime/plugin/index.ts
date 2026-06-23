import { definePlugin } from '@rstore/vue'
import { installBatchHook } from './batchHook'
import { installCacheHooks } from './cacheHooks'
import { createDrizzlePluginContext, drizzleScopeId } from './context'
import { installFetchHooks } from './fetchHooks'
import { installMutationHooks } from './mutationHooks'
import { installCollectionDefaults } from './utils/defaults'

export default definePlugin({
  name: 'rstore-drizzle',
  category: 'remote',
  scopeId: drizzleScopeId,
  setup({ addCollectionDefaults, hook }) {
    const ctx = createDrizzlePluginContext()
    installCollectionDefaults(addCollectionDefaults)
    installFetchHooks(ctx, hook)
    installCacheHooks(ctx, hook)
    installMutationHooks(ctx, hook)
    installBatchHook(ctx, hook)
  },
})
