export interface WebsocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'publish'
  topic: string
  payload?: any
}

export interface CollabEditMessage {
  type: 'collab:update'
  documentId: string
  fields: Record<string, any>
  userId: string
}

export interface CollabTextCursor {
  start: number
  end: number
  direction: 'forward' | 'backward' | 'none'
}

export interface CollabPresenceMessage {
  type: 'collab:presence'
  documentId: string
  userId: string
  userName: string
  userColor: string
  field?: string | null
  cursor?: CollabTextCursor | null
}

export interface CollabPresenceLeaveMessage {
  type: 'collab:leave'
  documentId: string
  userId: string
}
