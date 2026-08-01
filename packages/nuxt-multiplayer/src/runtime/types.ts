export interface MultiplayerTextCursor {
  start: number
  end: number
  direction: 'forward' | 'backward' | 'none'
}

export interface MultiplayerUser {
  id: string
  name: string
  color: string
}

export interface MultiplayerPeer<TField extends string = string> extends MultiplayerUser {
  /**
   * Connection-scoped id (one per channel instance / browser tab). Two
   * tabs of the same user appear as two peers sharing the same `id`.
   */
  clientId: string
  field?: TField | null
  cursor?: MultiplayerTextCursor | null
  lastSeen: number
}

export interface MultiplayerUpdateMessage<TUpdate = Record<string, any>> {
  type: 'multiplayer:update'
  roomId: string
  data: TUpdate
  userId: string
  /** Connection-scoped id — one per channel instance (browser tab). */
  clientId: string
}

export interface MultiplayerPresenceMessage<TField extends string = string> {
  type: 'multiplayer:presence'
  roomId: string
  user: MultiplayerUser
  /** Connection-scoped id — one per channel instance (browser tab). */
  clientId: string
  field?: TField | null
  cursor?: MultiplayerTextCursor | null
}

export interface MultiplayerLeaveMessage {
  type: 'multiplayer:leave'
  roomId: string
  userId: string
  /** Connection-scoped id — one per channel instance (browser tab). */
  clientId: string
}

export type MultiplayerMessage<
  TUpdate = Record<string, any>,
  TField extends string = string,
>
  = | MultiplayerUpdateMessage<TUpdate>
    | MultiplayerPresenceMessage<TField>
    | MultiplayerLeaveMessage
