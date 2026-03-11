import type { ComputedRef, Ref, ShallowRef } from 'vue'
import type { MultiplayerLeaveMessage, MultiplayerMessage, MultiplayerPeer, MultiplayerPresenceMessage, MultiplayerTextCursor, MultiplayerUpdateMessage, MultiplayerUser } from '../types'
import { useWebSocket } from '@vueuse/core'
import { useRuntimeConfig } from 'nuxt/app'
import { computed, onUnmounted, ref, shallowRef, triggerRef, watch } from 'vue'

const DEFAULT_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
] as const

export interface UseRstoreMultiplayerChannelOptions {
  roomId: string
  endpoint?: string
  user?: Partial<MultiplayerUser>
  heartbeatInterval?: number
  stalePeerTimeout?: number
  colors?: readonly string[]
}

export interface RstoreMultiplayerChannel<
  TUpdate = Record<string, any>,
  TField extends string = string,
> {
  user: MultiplayerUser
  peers: ComputedRef<MultiplayerPeer<TField>[]>
  remoteUpdate: Ref<TUpdate | null>
  status: Ref<string>
  joinRoom: () => void
  leaveRoom: () => void
  sendUpdate: (update: TUpdate) => void
  setFocusedField: (field?: TField | null) => void
  setTextCursor: (field: TField, cursor: MultiplayerTextCursor) => void
  clearFocus: () => void
}

export function useRstoreMultiplayerChannel<
  TUpdate = Record<string, any>,
  TField extends string = string,
>(
  options: UseRstoreMultiplayerChannelOptions,
): RstoreMultiplayerChannel<TUpdate, TField> {
  const runtimeConfig = useRuntimeConfig()
  const endpoint = (options.endpoint ?? runtimeConfig.public.wsEndpoint) as string | undefined
  const ws = useWebSocket(endpoint, {
    autoReconnect: true,
  })

  const user = createMultiplayerUser(options.user, options.colors)
  const peers = shallowRef(new Map<string, MultiplayerPeer<TField>>()) as ShallowRef<Map<string, MultiplayerPeer<TField>>>
  const remoteUpdate = shallowRef<TUpdate | null>(null)
  const localField = shallowRef(null) as ShallowRef<TField | null>
  const localCursor = ref<MultiplayerTextCursor | null>(null)

  function sendMessage(message: MultiplayerMessage<TUpdate, TField>) {
    ws.send(JSON.stringify(message))
  }

  function sendPresence() {
    sendMessage({
      type: 'multiplayer:presence',
      roomId: options.roomId,
      user,
      field: localField.value,
      cursor: localCursor.value,
    } satisfies MultiplayerPresenceMessage<TField>)
  }

  function joinRoom() {
    sendPresence()
  }

  function leaveRoom() {
    sendMessage({
      type: 'multiplayer:leave',
      roomId: options.roomId,
      userId: user.id,
    } satisfies MultiplayerLeaveMessage)
  }

  function sendUpdate(update: TUpdate) {
    sendMessage({
      type: 'multiplayer:update',
      roomId: options.roomId,
      data: update,
      userId: user.id,
    } satisfies MultiplayerUpdateMessage<TUpdate>)
  }

  function clearFocus() {
    localField.value = null
    localCursor.value = null
    sendPresence()
  }

  function setFocusedField(field?: TField | null) {
    const nextField = field ?? null
    if (nextField !== localField.value) {
      localCursor.value = null
    }
    localField.value = nextField
    if (!nextField) {
      localCursor.value = null
    }
    sendPresence()
  }

  function setTextCursor(field: TField, cursor: MultiplayerTextCursor) {
    localField.value = field
    localCursor.value = cursor
    sendPresence()
  }

  const stalePeerTimeout = options.stalePeerTimeout ?? 15000
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [id, peer] of peers.value) {
      if (now - peer.lastSeen > stalePeerTimeout) {
        peers.value.delete(id)
        triggerRef(peers)
      }
    }
  }, 5000)

  watch(ws.data, (data) => {
    if (!data) {
      return
    }

    try {
      const message = JSON.parse(data as string) as MultiplayerMessage<TUpdate, TField>

      if (message.type === 'multiplayer:update' && message.roomId === options.roomId && message.userId !== user.id) {
        remoteUpdate.value = message.data
      }
      else if (message.type === 'multiplayer:presence' && message.roomId === options.roomId && message.user?.id && message.user.id !== user.id) {
        peers.value.set(message.user.id, {
          ...message.user,
          field: message.field ?? null,
          cursor: message.cursor ?? null,
          lastSeen: Date.now(),
        })
        triggerRef(peers)
      }
      else if (message.type === 'multiplayer:leave' && message.roomId === options.roomId) {
        peers.value.delete(message.userId)
        triggerRef(peers)
      }
    }
    catch {
      // Ignore unrelated messages sent over the same socket.
    }
  })

  const heartbeatInterval = setInterval(() => {
    if (ws.status.value === 'OPEN') {
      sendPresence()
    }
  }, options.heartbeatInterval ?? 5000)

  watch(ws.status, (status) => {
    if (status === 'OPEN') {
      sendPresence()
    }
  })

  onUnmounted(() => {
    leaveRoom()
    clearInterval(cleanupInterval)
    clearInterval(heartbeatInterval)
  })

  return {
    user,
    peers: computed(() => Array.from(peers.value.values()).filter(isMultiplayerPeer<TField>)),
    remoteUpdate,
    status: ws.status,
    joinRoom,
    leaveRoom,
    sendUpdate,
    setFocusedField,
    setTextCursor,
    clearFocus,
  }
}

function createMultiplayerUser(
  input: Partial<MultiplayerUser> | undefined,
  colors: readonly string[] = DEFAULT_COLORS,
): MultiplayerUser {
  const id = input?.id ?? crypto.randomUUID()
  const name = input?.name ?? `User ${id.slice(0, 4).toUpperCase()}`
  const palette = colors.length > 0 ? colors : DEFAULT_COLORS
  const color = input?.color ?? palette[Math.floor(Math.random() * palette.length)] ?? DEFAULT_COLORS[0]

  return {
    id,
    name,
    color,
  }
}

function isMultiplayerPeer<TField extends string>(peer: unknown): peer is MultiplayerPeer<TField> {
  return !!peer
    && typeof peer === 'object'
    && 'id' in peer
    && typeof peer.id === 'string'
}
