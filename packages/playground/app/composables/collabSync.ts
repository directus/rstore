import type { CollabEditMessage, CollabPresenceLeaveMessage, CollabPresenceMessage } from '~~/shared/types/ws'

export interface CollabPeer {
  userId: string
  userName: string
  userColor: string
  field?: string
  lastSeen: number
}

export function useCollabSync(documentId: string) {
  const runtimeConfig = useRuntimeConfig()
  const ws = useWebSocket(runtimeConfig.public.wsEndpoint)

  // Generate a random user identity for this session
  const userId = crypto.randomUUID()
  const userName = `User ${userId.slice(0, 4).toUpperCase()}`
  const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']
  const userColor = colors[Math.floor(Math.random() * colors.length)]!

  const peers = ref<Map<string, CollabPeer>>(new Map())
  const remoteUpdates = ref<Record<string, any> | null>(null)

  // Join the collab room
  function joinRoom() {
    ws.send(JSON.stringify({
      type: 'collab:presence',
      documentId,
      userId,
      userName,
      userColor,
    } satisfies CollabPresenceMessage))
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
    ws.send(JSON.stringify({
      type: 'collab:presence',
      documentId,
      userId,
      userName,
      userColor,
      field,
    } satisfies CollabPresenceMessage))
  }

  // Clean up stale peers (not seen in 10s)
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [id, peer] of peers.value) {
      if (now - peer.lastSeen > 10000) {
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
          field: msg.field,
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
      ws.send(JSON.stringify({
        type: 'collab:presence',
        documentId,
        userId,
        userName,
        userColor,
      } satisfies CollabPresenceMessage))
    }
  }, 5000)

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
  }
}
