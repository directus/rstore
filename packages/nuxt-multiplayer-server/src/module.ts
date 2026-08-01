import { addServerHandler, addServerImports, addTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'

export * from './runtime/server/guards'
export * from './runtime/server/hooks'
export * from './runtime/server/identity'
export * from './runtime/server/origin'
export * from './runtime/server/rooms'
export * from './runtime/server/types'

export interface RstoreMultiplayerServerModuleOptions {
  /**
   * WebSocket endpoint the handler is mounted on.
   *
   * @default '/api/rstore-multiplayer/ws'
   */
  endpoint?: string
  /**
   * Maximum number of peers allowed in a single room. Excess joins are
   * silently rejected.
   *
   * @default 100
   */
  maxRoomSize?: number
  /**
   * Maximum payload size in bytes. Frames larger than this are dropped
   * (but the connection stays open).
   *
   * @default 16384
   */
  maxMessageBytes?: number
  /**
   * Per-peer rate limit configuration. Pass `false` or `null` to disable.
   *
   * @default { capacity: 60, refillPerSecond: 30 }
   */
  rateLimit?: { capacity: number, refillPerSecond: number } | false | null
  /**
   * Origins accepted at WebSocket upgrade time. By default only
   * same-origin upgrades are allowed (the `Origin` header host must match
   * the request `Host`) — this blocks cross-site WebSocket hijacking.
   * Provide an array of extra allowed origins (e.g.
   * `['https://app.example.com']`) or `false` to disable the check.
   *
   * @default undefined (same-origin only)
   */
  allowedOrigins?: string[] | false
}

// `allowedOrigins` intentionally has no default entry — `undefined` means
// "same-origin only", which is the safe default enforced at runtime.
const DEFAULT_OPTIONS: Required<Omit<RstoreMultiplayerServerModuleOptions, 'rateLimit' | 'allowedOrigins'>> & {
  rateLimit: { capacity: number, refillPerSecond: number } | null
} = {
  endpoint: '/api/rstore-multiplayer/ws',
  maxRoomSize: 100,
  maxMessageBytes: 16 * 1024,
  rateLimit: { capacity: 60, refillPerSecond: 30 },
}

export default defineNuxtModule<RstoreMultiplayerServerModuleOptions>({
  meta: {
    name: 'rstore-nuxt-multiplayer-server',
    configKey: 'rstoreMultiplayerServer',
    compatibility: {
      nuxt: '^3.19.2 || >=4.1.2',
    },
  },
  defaults: DEFAULT_OPTIONS as unknown as RstoreMultiplayerServerModuleOptions,
  setup(options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    const resolved = {
      endpoint: options.endpoint ?? DEFAULT_OPTIONS.endpoint,
      maxRoomSize: options.maxRoomSize ?? DEFAULT_OPTIONS.maxRoomSize,
      maxMessageBytes: options.maxMessageBytes ?? DEFAULT_OPTIONS.maxMessageBytes,
      rateLimit:
        options.rateLimit === false || options.rateLimit === null
          ? null
          : (options.rateLimit ?? DEFAULT_OPTIONS.rateLimit),
      allowedOrigins: options.allowedOrigins,
    }

    const nitro = ((nuxt.options as unknown as Record<string, any>).nitro ??= {}) as Record<string, any>
    nitro.experimental ??= {}
    nitro.experimental.websocket = true

    addTemplate({
      filename: '$rstore-multiplayer-server-config.js',
      getContents: () => `export const maxRoomSize = ${JSON.stringify(resolved.maxRoomSize)}
export const maxMessageBytes = ${JSON.stringify(resolved.maxMessageBytes)}
export const rateLimit = ${JSON.stringify(resolved.rateLimit)}
export const allowedOrigins = ${JSON.stringify(resolved.allowedOrigins)}
`,
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
    ])
  },
})
