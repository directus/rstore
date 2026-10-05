import type { UseWebSocketReturn } from '@vueuse/core'
import type { RstoreMultiplayerChannel, UseRstoreMultiplayerChannelOptions } from '../types'
import { createPresenceChannel } from '@rstore/multiplayer/presence'
import { useWebSocket } from '@vueuse/core'
import { useRuntimeConfig } from 'nuxt/app'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'

export type { RstoreMultiplayerChannel, UseRstoreMultiplayerChannelOptions } from '../types'

/**
 * Join a multiplayer room over a WebSocket: a Vue wrapper around
 * `createPresenceChannel` from `@rstore/multiplayer/presence`. The channel
 * leaves the room when the calling component (or effect scope) is disposed.
 */
export function useRstoreMultiplayerChannel<
  TUpdate = Record<string, any>,
  TField extends string = string,
>(
  options: UseRstoreMultiplayerChannelOptions,
): RstoreMultiplayerChannel<TUpdate, TField> {
  const runtimeConfig = useRuntimeConfig()
  const endpoint = (options.endpoint ?? runtimeConfig.public.wsEndpoint) as string | undefined
  // The socket feeds the channel and the channel sends through the socket:
  // the socket is assigned right after, before any timer can fire.
  let ws: UseWebSocketReturn<any>
  const channel = createPresenceChannel<TUpdate, TField>({
    roomId: options.roomId,
    user: options.user,
    colors: options.colors,
    heartbeatMs: options.heartbeatInterval,
    staleMs: options.stalePeerTimeout,
    transport: {
      send: text => ws.send(text),
      isOpen: () => ws.status.value === 'OPEN',
    },
    onInvalidMessage: warnInvalidMessage,
  })

  ws = useWebSocket(endpoint, {
    autoReconnect: true,
    // `onMessage` fires for every frame — unlike watching `ws.data`,
    // which skips consecutive identical payloads (Object.is) and would
    // let idle peers' heartbeats go unseen until stale cleanup evicts them.
    onMessage: (_ws, event) => {
      channel.receive(event.data)
    },
  })

  const state = shallowRef(channel.getState())
  channel.subscribe((next) => {
    state.value = next
  })
  const remoteUpdate = shallowRef<TUpdate | null>(null)
  channel.onUpdate((update) => {
    remoteUpdate.value = update
  })

  watch(ws.status, (status) => {
    if (status === 'OPEN') {
      channel.handleOpen()
    }
  })

  onScopeDispose(() => {
    channel.dispose()
  })

  return {
    user: channel.user,
    clientId: channel.clientId,
    peers: computed(() => state.value.peers),
    presenceUsers: computed(() => state.value.users),
    typingPeers: computed(() => state.value.typing),
    remoteUpdate,
    status: ws.status,
    joinRoom: channel.join,
    leaveRoom: channel.leave,
    sendUpdate: channel.sendUpdate,
    setFocusedField: channel.setFocusedField,
    setTextCursor: channel.setTextCursor,
    rebaseTextCursor: channel.rebaseTextCursor,
    clearFocus: channel.clearFocus,
    notifyTyping: channel.notifyTyping,
    stopTyping: channel.stopTyping,
  }
}

/** Surface misbehaving peers outside production builds. */
function warnInvalidMessage(value: unknown) {
  // eslint-disable-next-line node/prefer-global/process
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    console.warn('[rstore-multiplayer] Dropped invalid message:', value)
  }
}
