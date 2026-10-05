/**
 * Wire frame types. In 0.9 their definitions still live in `@rstore/shared`
 * (so `@rstore/shared` needs no dependency on this package); they move here
 * in 0.10. New frames are defined in this package directly.
 */
export type {
  MultiplayerLeaveMessage,
  MultiplayerMessage,
  MultiplayerPresenceMessage,
  MultiplayerTextCursor,
  MultiplayerTypingMessage,
  MultiplayerTypingTarget,
  MultiplayerUpdateMessage,
  MultiplayerUser,
} from '@rstore/shared'

/** Options of `parseMultiplayerMessage`. */
export interface ParseMultiplayerMessageOptions {
  /**
   * Called with the parsed value of a JSON payload that is not a valid frame.
   * Typical use: a dev-only warning about a misbehaving peer.
   */
  onInvalid?: (value: unknown) => void
}
