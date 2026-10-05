import type {
  MultiplayerAuthorizePayload as BaseAuthorizePayload,
  MultiplayerFilterPayload as BaseFilterPayload,
  MultiplayerServerHooks as BaseServerHooks,
} from '@rstore/multiplayer/server'
import type { Peer } from 'crossws'
import { createMultiplayerServerHooks } from '@rstore/multiplayer/server'

export type { Awaitable } from '@rstore/multiplayer/server'

/** `multiplayer.authorize` payload; `peer` is the crossws peer (with its upgrade `request`). */
export type MultiplayerAuthorizePayload = BaseAuthorizePayload<Peer>

/** `multiplayer.filter` payload; `peer` is the crossws peer. */
export type MultiplayerFilterPayload<TUpdate = any, TField extends string = string> = BaseFilterPayload<Peer, TUpdate, TField>

/** Hooks of the Nitro multiplayer server, by name. */
export type MultiplayerServerHooks = BaseServerHooks<Peer>

/**
 * Hook registry of the Nitro WebSocket handler. It is a module singleton so
 * Nitro plugins can register handlers at startup:
 *
 * ```ts
 * rstoreMultiplayerServerHooks.hook('multiplayer.authorize', ({ peer, reject, setUserId }) => { … })
 * ```
 */
export const rstoreMultiplayerServerHooks = createMultiplayerServerHooks<Peer>()
