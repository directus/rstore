import type { CollabEditMessage, CollabPresenceLeaveMessage, CollabPresenceMessage, CollabTextCursor } from '~~/shared/types/ws'

export interface CollabPeer {
  userId: string
  userName: string
  userColor: string
  field?: string | null
  cursor?: CollabTextCursor | null
  lastSeen: number
}

export function useCollabSync(documentId: string) {
  const runtimeConfig = useRuntimeConfig()
  const ws = useWebSocket(runtimeConfig.public.wsEndpoint, {
    autoReconnect: true,
  })

  // Generate a random user identity for this session
  const userId = crypto.randomUUID()
  const userName = `User ${userId.slice(0, 4).toUpperCase()}`
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']
  const userColor = colors[Math.floor(Math.random() * colors.length)]!

  const peers = ref<Map<string, CollabPeer>>(new Map())
  const remoteUpdates = ref<Record<string, any> | null>(null)
  const localField = ref<string | null>(null)
  const localCursor = ref<CollabTextCursor | null>(null)

  function sendPresence() {
    ws.send(JSON.stringify({
      type: 'collab:presence',
      documentId,
      userId,
      userName,
      userColor,
      field: localField.value,
      cursor: localCursor.value,
    } satisfies CollabPresenceMessage))
  }

  // Join the collab room
  function joinRoom() {
    sendPresence()
  }

  // Leave the collab room
  function leaveRoom() {
    ws.send(JSON.stringify({
      type: 'collab:leave',
      documentId,
      userId,
    } satisfies CollabPresenceLeaveMessage))
  }

  // Broadcast field changes to other peers
  function broadcastChanges(fields: Record<string, any>) {
    ws.send(JSON.stringify({
      type: 'collab:update',
      documentId,
      fields,
      userId,
    } satisfies CollabEditMessage))
  }

  // Broadcast which field the user is currently editing
  function broadcastFocus(field?: string) {
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

  function broadcastCursor(field: string, cursor: CollabTextCursor) {
    localField.value = field
    localCursor.value = cursor
    sendPresence()
  }

  // Clean up stale peers (not seen in 15s)
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [id, peer] of peers.value) {
      if (now - peer.lastSeen > 15000) {
        peers.value.delete(id)
      }
    }
  }, 5000)

  // Listen for incoming messages
  watch(ws.data, (data: string) => {
    if (!data)
      return
    try {
      const msg = JSON.parse(data) as CollabEditMessage | CollabPresenceMessage | CollabPresenceLeaveMessage
      if (msg.type === 'collab:update' && msg.documentId === documentId && msg.userId !== userId) {
        remoteUpdates.value = msg.fields
      }
      else if (msg.type === 'collab:presence' && msg.documentId === documentId && msg.userId !== userId) {
        peers.value.set(msg.userId, {
          userId: msg.userId,
          userName: msg.userName,
          userColor: msg.userColor,
          field: msg.field ?? null,
          cursor: msg.cursor ?? null,
          lastSeen: Date.now(),
        })
      }
      else if (msg.type === 'collab:leave' && msg.documentId === documentId) {
        peers.value.delete(msg.userId)
      }
    }
    catch {
      // ignore non-collab messages
    }
  })

  // Heartbeat presence every 5s
  const heartbeatInterval = setInterval(() => {
    if (ws.status.value === 'OPEN') {
      sendPresence()
    }
  }, 5000)

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

  const peerList = computed(() => Array.from(peers.value.values()))

  return {
    userId,
    userName,
    userColor,
    peers: peerList,
    remoteUpdates,
    joinRoom,
    leaveRoom,
    broadcastChanges,
    broadcastFocus,
    broadcastCursor,
  }
}
