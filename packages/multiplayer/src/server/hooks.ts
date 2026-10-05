import type { MultiplayerMessage } from '../protocol/types.js'

/** Value or promise, like hookable handlers. */
export type Awaitable<T> = T | Promise<T>

/**
 * A connection as the multiplayer server sees it: text frames in (through
 * `handleMessage`), text frames out. Transport adapters pass their own peer
 * objects (a crossws `Peer` fits), which hooks receive unchanged.
 */
export interface MultiplayerServerPeer {
  /** Transport-level connection id, unique per server. */
  id: string
  /** Send one serialized (JSON) frame. */
  send: (text: string) => void
}

/**
 * Invoked the first time a peer sends a frame for a room it has not joined.
 * Handlers may call `reject()` to refuse entry: the server then drops the
 * frame silently.
 */
export interface MultiplayerAuthorizePayload<TPeer extends MultiplayerServerPeer = MultiplayerServerPeer> {
  peer: TPeer
  roomId: string
  reject: (reason?: string) => void
  /**
   * Bind a server-verified user id to this connection (e.g. from the session
   * cookie of the upgrade request). Once bound, every frame the peer sends is
   * stamped with this id: client-supplied `userId` / `user.id` values are
   * overwritten, so peers cannot impersonate other users. When no handler
   * calls this, the first client-supplied id is bound instead
   * (trust-on-first-frame).
   */
  setUserId: (userId: string) => void
}

/**
 * Invoked on every inbound frame, after identity stamping and before fan-out
 * to the other room members. Handlers may call `reject()` to stop the
 * broadcast (e.g. to drop spammy updates or enforce field-level ACLs).
 */
export interface MultiplayerFilterPayload<TPeer extends MultiplayerServerPeer = MultiplayerServerPeer, TUpdate = any, TField extends string = string> {
  peer: TPeer
  roomId: string
  message: MultiplayerMessage<TUpdate, TField>
  reject: () => void
}

/** Hooks of the multiplayer room server, by name. */
export interface MultiplayerServerHooks<TPeer extends MultiplayerServerPeer = MultiplayerServerPeer> {
  'multiplayer.authorize': (payload: MultiplayerAuthorizePayload<TPeer>) => Awaitable<void>
  'multiplayer.filter': (payload: MultiplayerFilterPayload<TPeer>) => Awaitable<void>
}

/** Hook registry shared by a multiplayer server and the app code that extends it. */
export interface MultiplayerServerHookRegistry<TPeer extends MultiplayerServerPeer = MultiplayerServerPeer> {
  /** Register a handler. Returns a function that unregisters it. */
  hook: <K extends keyof MultiplayerServerHooks<TPeer>>(name: K, handler: MultiplayerServerHooks<TPeer>[K]) => () => void
  /** Await every handler of `name` in registration order. */
  callHook: <K extends keyof MultiplayerServerHooks<TPeer>>(name: K, payload: Parameters<MultiplayerServerHooks<TPeer>[K]>[0]) => Promise<void>
  /** True when at least one handler is registered for `name`. */
  hasHook: (name: keyof MultiplayerServerHooks<TPeer>) => boolean
}

/**
 * Create a hook registry for `createMultiplayerServer({ hooks })`. Adapters
 * usually keep one as a module singleton, so app plugins can register
 * handlers at startup without access to the server instance.
 */
export function createMultiplayerServerHooks<TPeer extends MultiplayerServerPeer = MultiplayerServerPeer>(): MultiplayerServerHookRegistry<TPeer> {
  type Handler = (payload: any) => Awaitable<void>
  const handlers = new Map<string, Handler[]>()

  return {
    hook(name, handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler as Handler])
      return () => {
        const next = (handlers.get(name) ?? []).filter(h => h !== handler)
        if (next.length)
          handlers.set(name, next)
        else
          handlers.delete(name)
      }
    },
    async callHook(name, payload) {
      // Handler lists are replaced, never mutated, so a handler unregistering
      // itself during the walk cannot skip the next one.
      for (const handler of handlers.get(name) ?? [])
        await handler(payload)
    },
    hasHook(name) {
      return (handlers.get(name)?.length ?? 0) > 0
    },
  }
}
