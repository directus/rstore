import type { RstoreMultiplayerServerModuleOptions } from './options'
import { addServerHandler, addServerImports, addServerTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'
import { DEFAULT_SERVER_MODULE_OPTIONS, renderServerConfigTemplate, resolveServerModuleOptions } from './options'

export type { RstoreMultiplayerServerModuleOptions } from './options'
export type { RstoreCollabOptions, RstoreCollabPeer } from './runtime/server/collab'
export * from './runtime/server/guards'
export * from './runtime/server/hooks'
export * from './runtime/server/types'
// Compatibility exports: the room server lives in `@rstore/multiplayer/server`.
export {
  isOriginAllowed,
  PeerIdentityStore,
  PeerRateLimiter,
  Room,
  RoomRegistry,
} from '@rstore/multiplayer/server'
export type {
  MultiplayerAllowedOrigins,
  PeerIdentity,
  RoomPeer,
  TokenBucketOptions,
} from '@rstore/multiplayer/server'

export default defineNuxtModule<RstoreMultiplayerServerModuleOptions>({
  meta: {
    name: 'rstore-nuxt-multiplayer-server',
    configKey: 'rstoreMultiplayerServer',
    compatibility: {
      nuxt: '^3.19.2 || >=4.1.2',
    },
  },
  defaults: DEFAULT_SERVER_MODULE_OPTIONS as RstoreMultiplayerServerModuleOptions,
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)
    const resolved = resolveServerModuleOptions(options)

    const nitro = ((nuxt.options as unknown as Record<string, any>).nitro ??= {}) as Record<string, any>
    nitro.experimental ??= {}
    nitro.experimental.websocket = true

    // A Nitro virtual module: server code may not import `#build` app templates.
    addServerTemplate({
      filename: '$rstore-multiplayer-server-config.js',
      getContents: () => renderServerConfigTemplate(resolved),
    })

    addServerHandler({
      handler: resolve('./runtime/server/handler-entry'),
      route: resolved.endpoint,
    })

    addServerImports([
      {
        name: 'rstoreMultiplayerServerHooks',
        from: resolve('./runtime/server/hooks'),
      },
      ...(resolved.collab
        ? ['defineRstoreCollab', 'useRstoreCollabServer'].map(name => ({ name, from: resolve('./runtime/server/collab') }))
        : []),
    ])

    // The collab client (`useRstoreCollabDocument`) connects here by default.
    const publicConfig = nuxt.options.runtimeConfig.public as Record<string, unknown>
    publicConfig.rstoreMultiplayerEndpoint ??= resolved.endpoint
  },
})
