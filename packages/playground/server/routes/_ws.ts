import type { MultiplayerLeaveMessage, MultiplayerPresenceMessage, MultiplayerUpdateMessage, WebsocketMessage } from '~~/shared/types/ws'

export default defineWebSocketHandler({
  message(peer, message) {
    const data = message.json<WebsocketMessage | MultiplayerUpdateMessage | MultiplayerPresenceMessage | MultiplayerLeaveMessage>()
    if (data.type === 'subscribe') {
      peer.subscribe(data.topic)
    }
    else if (data.type === 'unsubscribe') {
      peer.unsubscribe(data.topic)
    }
    else if (data.type === 'publish') {
      peer.publish(data.topic, JSON.stringify({ item: data.payload }))
    }
    else if (data.type === 'multiplayer:update') {
      const topic = data.roomId
      peer.publish(topic, JSON.stringify(data))
    }
    else if (data.type === 'multiplayer:presence') {
      const topic = data.roomId
      peer.subscribe(topic)
      peer.publish(topic, JSON.stringify(data))
    }
    else if (data.type === 'multiplayer:leave') {
      const topic = data.roomId
      peer.publish(topic, JSON.stringify(data))
      peer.unsubscribe(topic)
    }
  },
  close() {
    // noop
  },
})
