import type { Nuxt } from '@nuxt/schema'
import type { ModuleOptions, RealtimeResolvedOptions } from './types'
import { addServerHandler, addServerImports, addServerPlugin, addTemplate } from '@nuxt/kit'

/** Resolve realtime options and register websocket integration when enabled. */
export function setupRealtime({
  options,
  nuxt,
  resolve,
  addPluginImport,
}: {
  options: ModuleOptions
  nuxt: Nuxt
  resolve: (path: string) => string
  addPluginImport: (nuxt: Nuxt, path: string) => void
}): RealtimeResolvedOptions {
  const wsOptions = typeof options.ws === 'object' ? options.ws : {}
  const resolved = {
    wsApiPath: wsOptions.apiPath ?? `/api/rstore-realtime/ws`,
    wsClientEndpoint: wsOptions.clientEndpoint ?? wsOptions.apiPath ?? `/api/rstore-realtime/ws`,
    wsHeartbeatInterval: wsOptions.heartbeatInterval ?? 10000,
    wsAutoReconnect: wsOptions.autoReconnect ?? true,
  }

  if (options.ws) {
    nuxt.options.nitro.experimental ??= {}
    nuxt.options.nitro.experimental.websocket = true
    addServerHandler({
      handler: resolve('./runtime/server/api/realtime.ws'),
      route: resolved.wsApiPath,
    })
    addServerPlugin(resolve('./runtime/server/plugins/publish-hooks'))
    addPluginImport(nuxt, resolve('./runtime/plugin-realtime'))
    if (wsOptions.lww !== false) {
      registerMultiplayerPlugin(nuxt, addPluginImport)
    }
    registerRealtimeServerImports(resolve)
  }

  return resolved
}

/**
 * Install the multiplayer LWW plugin, so stamped realtime frames merge field by
 * field and deletes leave tombstones (form text merge stays opt-in).
 */
function registerMultiplayerPlugin(nuxt: Nuxt, addPluginImport: (nuxt: Nuxt, path: string) => void) {
  const pluginFile = 'rstore-drizzle-multiplayer-plugin.ts'
  addTemplate({
    filename: pluginFile,
    write: true,
    getContents: () => `import { createMultiplayerPlugin } from '@rstore/multiplayer'
export default createMultiplayerPlugin({ lww: true, formTextMerge: false })
`,
  })
  addPluginImport(nuxt, `#build/${pluginFile}`)
}

function registerRealtimeServerImports(resolve: (path: string) => string) {
  addServerImports({
    name: 'setPubSub',
    from: resolve('./runtime/server/utils/pubsub'),
    as: 'setRstoreDrizzlePubSub',
  })
  addServerImports({
    name: 'publishRstoreDrizzleRealtimeUpdate',
    from: resolve('./runtime/server/utils/realtime'),
  })
  // `type: true` — these are type-only exports; registering them as runtime
  // imports would inject imports of names that don't exist in the built JS.
  addServerImports([
    'RstoreDrizzlePubSubChannels',
    'RstoreDrizzlePubSub',
  ].map(name => ({ from: resolve('./runtime/server/utils/pubsub'), name, type: true })))
  addServerImports([
    'RstoreDrizzleRealtimeUpdateType',
    'PublishRstoreDrizzleRealtimeUpdateOptions',
  ].map(name => ({ from: resolve('./runtime/server/utils/realtime'), name, type: true })))
}
