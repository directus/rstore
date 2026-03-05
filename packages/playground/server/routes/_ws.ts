export default defineWebSocketHandler({
  message(peer, message) {
    const data = message.json<WebsocketMessage | CollabEditMessage | CollabPresenceMessage | CollabPresenceLeaveMessage>()
    if (data.type === 'subscribe') {
      peer.subscribe(data.topic)
    }
    else if (data.type === 'unsubscribe') {
      peer.unsubscribe(data.topic)
    }
    else if (data.type === 'publish') {
      peer.publish(data.topic, JSON.stringify({ item: data.payload }))
    }
    else if (data.type === 'collab:update') {
      // Broadcast document field changes to all peers editing the same document
      const topic = `collab:${data.documentId}`
      peer.publish(topic, JSON.stringify(data))
    }
    else if (data.type === 'collab:presence') {
      // Broadcast presence info to all peers on the same document
      const topic = `collab:${data.documentId}`
      peer.subscribe(topic)
      peer.publish(topic, JSON.stringify(data))
    }
    else if (data.type === 'collab:leave') {
      const topic = `collab:${data.documentId}`
      peer.publish(topic, JSON.stringify(data))
      peer.unsubscribe(topic)
    }
  },
  close() {
    // noop
  },
})
