// Import these types from `@rstore/multiplayer/protocol`. They are defined
// here for one minor (0.9) so that @rstore/shared needs no dependency on
// @rstore/multiplayer, which re-exports them; the definitions move there in 0.10.

/** Cursor selection sent with a multiplayer presence frame. */
export interface MultiplayerTextCursor {
  /** Inclusive selection start offset. */
  start: number
  /** Exclusive selection end offset. */
  end: number
  /** Selection direction reported by the browser. */
  direction: 'forward' | 'backward' | 'none'
}

/** Public identity and display metadata for a multiplayer participant. */
export interface MultiplayerUser {
  /** Stable participant id. */
  id: string
  /** Display name shown to room peers. */
  name: string
  /** Display color shown to room peers. */
  color: string
}

/** A state update sent by a participant to other members of a room. */
export interface MultiplayerUpdateMessage<TUpdate = Record<string, any>> {
  /** Discriminant for an update frame. */
  type: 'multiplayer:update'
  /** Room receiving the update. */
  roomId: string
  /** Application-defined update payload. */
  data: TUpdate
  /** Participant that sent the update. */
  userId: string
  /** Connection-scoped id: one per channel instance or browser tab. */
  clientId: string
}

/** Presence state sent by a participant to other members of a room. */
export interface MultiplayerPresenceMessage<TField extends string = string> {
  /** Discriminant for a presence frame. */
  type: 'multiplayer:presence'
  /** Room receiving the presence state. */
  roomId: string
  /** Participant identity and display metadata. */
  user: MultiplayerUser
  /** Connection-scoped id: one per channel instance or browser tab. */
  clientId: string
  /** Field currently focused by the participant. */
  field?: TField | null
  /** Text selection in the focused field. */
  cursor?: MultiplayerTextCursor | null
}

/** A participant's explicit room departure. */
export interface MultiplayerLeaveMessage {
  /** Discriminant for a departure frame. */
  type: 'multiplayer:leave'
  /** Room the participant left. */
  roomId: string
  /** Participant that left the room. */
  userId: string
  /** Connection-scoped id: one per channel instance or browser tab. */
  clientId: string
}

/** What a participant is typing into: a record, optionally one of its fields. */
export interface MultiplayerTypingTarget {
  /** Collection name of the record. */
  collection: string
  /** Key of the record. */
  key: string | number
  /** Field being typed into, if any. */
  field?: string
}

/**
 * Typing indicator. It never carries the typed content: the guard rejects
 * any key outside this shape.
 */
export interface MultiplayerTypingMessage {
  /** Discriminant for a typing frame. */
  type: 'multiplayer:typing'
  /** Room receiving the indicator. */
  roomId: string
  /** Participant that is typing. */
  userId: string
  /** Connection-scoped id: one per channel instance or browser tab. */
  clientId: string
  /** Where the participant types; `null` when they stopped. */
  target: MultiplayerTypingTarget | null
}

/** Every frame accepted by the multiplayer wire protocol. */
export type MultiplayerMessage<
  TUpdate = Record<string, any>,
  TField extends string = string,
>
  = | MultiplayerUpdateMessage<TUpdate>
    | MultiplayerPresenceMessage<TField>
    | MultiplayerLeaveMessage
    | MultiplayerTypingMessage
