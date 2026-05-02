/**
 * Wire protocol types — kept Nuxt-free so the server handler can be
 * lifted into a standalone Node/Deno/Bun process if desired. Structure
 * mirrors `@rstore/nuxt-multiplayer/runtime/types` exactly.
 */

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

export interface MultiplayerUpdateMessage<TUpdate = Record<string, any>> {
  type: 'multiplayer:update'
  roomId: string
  data: TUpdate
  userId: string
}

export interface MultiplayerPresenceMessage<TField extends string = string> {
  type: 'multiplayer:presence'
  roomId: string
  user: MultiplayerUser
  field?: TField | null
  cursor?: MultiplayerTextCursor | null
}

export interface MultiplayerLeaveMessage {
  type: 'multiplayer:leave'
  roomId: string
  userId: string
}

export type MultiplayerMessage<
  TUpdate = Record<string, any>,
  TField extends string = string,
>
  = | MultiplayerUpdateMessage<TUpdate>
    | MultiplayerPresenceMessage<TField>
    | MultiplayerLeaveMessage
