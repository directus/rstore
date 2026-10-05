/** Options of the `rstoreMultiplayerServer` Nuxt module. */
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
  /**
   * Serve collab documents (rich-text OT, experimental) on the same endpoint:
   * `collab:*` frames go to the sequencer configured with
   * `defineRstoreCollab()` in a Nitro plugin (in-memory op log by default).
   *
   * @default false
   */
  collab?: boolean | {
    /**
     * Maximum `collab:*` frame size. Larger than room frames: a reconnecting
     * client resubmits its offline edits in one frame.
     * @default 1048576
     */
    maxMessageBytes?: number
    /**
     * Per-peer rate limit of `collab:*` frames. `false`/`null` disables it.
     * @default { capacity: 120, refillPerSecond: 60 }
     */
    rateLimit?: { capacity: number, refillPerSecond: number } | false | null
  }
}

/** Resolved `collab` option (`null` = disabled). */
export interface ResolvedCollabOptions {
  maxMessageBytes: number
  rateLimit: { capacity: number, refillPerSecond: number } | null
}

/** Module options with their defaults applied (`rateLimit: null` = disabled). */
export interface ResolvedServerModuleOptions {
  endpoint: string
  maxRoomSize: number
  maxMessageBytes: number
  rateLimit: { capacity: number, refillPerSecond: number } | null
  allowedOrigins: string[] | false | undefined
  collab: ResolvedCollabOptions | null
}

// `allowedOrigins` intentionally has no default entry — `undefined` means
// "same-origin only", which is the safe default enforced at runtime.
export const DEFAULT_SERVER_MODULE_OPTIONS: Omit<ResolvedServerModuleOptions, 'allowedOrigins' | 'collab'> = {
  endpoint: '/api/rstore-multiplayer/ws',
  maxRoomSize: 100,
  maxMessageBytes: 16 * 1024,
  rateLimit: { capacity: 60, refillPerSecond: 30 },
}

/** Defaults of an enabled `collab` option. */
export const DEFAULT_COLLAB_OPTIONS: ResolvedCollabOptions = {
  maxMessageBytes: 1024 * 1024,
  rateLimit: { capacity: 120, refillPerSecond: 60 },
}

/** Resolve the `collab` option. */
function resolveCollabOptions(collab: RstoreMultiplayerServerModuleOptions['collab']): ResolvedCollabOptions | null {
  if (!collab) {
    return null
  }
  const options = collab === true ? {} : collab
  return {
    maxMessageBytes: options.maxMessageBytes ?? DEFAULT_COLLAB_OPTIONS.maxMessageBytes,
    rateLimit: options.rateLimit === false || options.rateLimit === null ? null : (options.rateLimit ?? DEFAULT_COLLAB_OPTIONS.rateLimit),
  }
}

/** Apply the defaults to the module options. */
export function resolveServerModuleOptions(options: RstoreMultiplayerServerModuleOptions): ResolvedServerModuleOptions {
  return {
    endpoint: options.endpoint ?? DEFAULT_SERVER_MODULE_OPTIONS.endpoint,
    maxRoomSize: options.maxRoomSize ?? DEFAULT_SERVER_MODULE_OPTIONS.maxRoomSize,
    maxMessageBytes: options.maxMessageBytes ?? DEFAULT_SERVER_MODULE_OPTIONS.maxMessageBytes,
    rateLimit: options.rateLimit === false || options.rateLimit === null
      ? null
      : (options.rateLimit ?? DEFAULT_SERVER_MODULE_OPTIONS.rateLimit),
    allowedOrigins: options.allowedOrigins,
    collab: resolveCollabOptions(options.collab),
  }
}

/** Contents of `#build/$rstore-multiplayer-server-config.js`, read by the handler entry. */
export function renderServerConfigTemplate(resolved: ResolvedServerModuleOptions): string {
  return `export const maxRoomSize = ${JSON.stringify(resolved.maxRoomSize)}
export const maxMessageBytes = ${JSON.stringify(resolved.maxMessageBytes)}
export const rateLimit = ${JSON.stringify(resolved.rateLimit)}
export const allowedOrigins = ${JSON.stringify(resolved.allowedOrigins)}
export const collab = ${JSON.stringify(resolved.collab)}
`
}
