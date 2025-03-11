export interface WebsocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'publish'
  topic: string
  payload?: any
}
