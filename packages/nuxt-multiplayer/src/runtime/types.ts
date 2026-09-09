import type { MultiplayerTextCursor, MultiplayerUser } from '@rstore/shared'

export type {
  MultiplayerLeaveMessage,
  MultiplayerMessage,
  MultiplayerPresenceMessage,
  MultiplayerTextCursor,
  MultiplayerUpdateMessage,
  MultiplayerUser,
} from '@rstore/shared'

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
