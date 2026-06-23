import type { Nuxt } from '@nuxt/schema'
import type { ModuleOptions, RealtimeResolvedOptions } from './types'
import { addServerHandler, addServerImports, addServerPlugin } from '@nuxt/kit'

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
    registerRealtimeServerImports(resolve)
  }

  return resolved
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
  addServerImports([
    'RstoreDrizzlePubSubChannels',
    'RstoreDrizzlePubSub',
  ].map(name => ({ from: resolve('./runtime/server/utils/pubsub'), name })))
  addServerImports([
    'RstoreDrizzleRealtimeUpdateType',
    'PublishRstoreDrizzleRealtimeUpdateOptions',
  ].map(name => ({ from: resolve('./runtime/server/utils/realtime'), name })))
}
