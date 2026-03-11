export interface WebsocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'publish'
  topic: string
  payload?: any
}

export type {
  MultiplayerLeaveMessage,
  MultiplayerMessage,
  MultiplayerPeer,
  MultiplayerPresenceMessage,
  MultiplayerTextCursor,
  MultiplayerUpdateMessage,
  MultiplayerUser,
} from '../../../nuxt-multiplayer/src/runtime/types'
