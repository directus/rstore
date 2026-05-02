import type { Peer } from 'crossws'
import type { MultiplayerMessage } from './types'

/** Generic awaitable — match hookable signature style. */
export type Awaitable<T> = T | Promise<T>

/**
 * Invoked the first time a peer enters a room (or sends a presence frame
 * for a room they've not yet joined). Handlers may call `reject()` to
 * refuse entry — the server then drops the frame silently.
 */
export interface MultiplayerAuthorizePayload {
  peer: Peer
  roomId: string
  reject: (reason?: string) => void
}

/**
 * Invoked on every inbound message before fan-out to other room members.
 * Handlers may call `reject()` to stop the broadcast (e.g. to drop
 * spammy updates or enforce field-level ACLs).
 */
export interface MultiplayerFilterPayload<TUpdate = any, TField extends string = string> {
  peer: Peer
  roomId: string
  message: MultiplayerMessage<TUpdate, TField>
  reject: () => void
}

export interface MultiplayerServerHooks {
  'multiplayer.authorize': (payload: MultiplayerAuthorizePayload) => Awaitable<void>
  'multiplayer.filter': (payload: MultiplayerFilterPayload) => Awaitable<void>
}

type HookName = keyof MultiplayerServerHooks

type HookHandler<K extends HookName> = MultiplayerServerHooks[K]

/**
 * Tiny hooks registry. Lives as a module singleton so user plugins can
 * register handlers at server startup without having to thread the
 * registry through the request pipeline.
 */
class MultiplayerHooks {
  private handlers: Map<HookName, Array<(payload: any) => Awaitable<void>>> = new Map()

  hook<K extends HookName>(name: K, handler: HookHandler<K>): () => void {
    let list = this.handlers.get(name)
    if (!list) {
      list = []
      this.handlers.set(name, list)
    }
    list.push(handler as (payload: any) => Awaitable<void>)
    return () => {
      const existing = this.handlers.get(name)
      if (!existing) {
        return
      }
      const next = existing.filter(h => h !== handler)
      if (next.length === 0) {
        this.handlers.delete(name)
      }
      else {
        this.handlers.set(name, next)
      }
    }
  }

  async callHook<K extends HookName>(name: K, payload: Parameters<HookHandler<K>>[0]): Promise<void> {
    const handlers = this.handlers.get(name)
    if (!handlers?.length) {
      return
    }
    for (const handler of handlers) {
      await handler(payload)
    }
  }
}

export const rstoreMultiplayerServerHooks = new MultiplayerHooks()
