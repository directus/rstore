import type { MultiplayerPeer, MultiplayerTypingPeer, PresenceChannel } from '@rstore/multiplayer/presence'
import type { MultiplayerUser } from '@rstore/multiplayer/protocol'
import type { ComputedRef, Ref } from 'vue'

export type { RstoreCollabDocument, UseRstoreCollabDocumentOptions } from './composables/useRstoreCollabDocument'
export type {
  MultiplayerPeer,
  MultiplayerTypingPeer,
} from '@rstore/multiplayer/presence'

/** Options of `useRstoreMultiplayerChannel`. */
export interface UseRstoreMultiplayerChannelOptions {
  roomId: string
  /** WebSocket endpoint. @default runtimeConfig.public.wsEndpoint */
  endpoint?: string
  /** Local user; missing parts are generated. */
  user?: Partial<MultiplayerUser>
  /** Presence heartbeat period in ms. @default 5000 */
  heartbeatInterval?: number
  /** A peer without frames for this long (ms) is dropped. @default 15000 */
  stalePeerTimeout?: number
  /** Palette for a generated user color. */
  colors?: readonly string[]
}

type ChannelActions<TUpdate, TField extends string> = Pick<
  PresenceChannel<TUpdate, TField>,
  'sendUpdate' | 'setFocusedField' | 'setTextCursor' | 'rebaseTextCursor' | 'clearFocus' | 'notifyTyping' | 'stopTyping'
>

/** Reactive multiplayer room channel returned by `useRstoreMultiplayerChannel`. */
export interface RstoreMultiplayerChannel<
  TUpdate = Record<string, any>,
  TField extends string = string,
> extends ChannelActions<TUpdate, TField> {
  user: MultiplayerUser
  /**
   * Connection-scoped id, unique per channel instance. Used to filter
   * self-echoed frames so two tabs of the same user still see each other.
   */
  clientId: string
  /**
   * One entry per remote connection (keyed by `clientId`) — two tabs of
   * the same user yield two peers sharing the same `id`. Use
   * `presenceUsers` for a per-user aggregated list.
   */
  peers: ComputedRef<MultiplayerPeer<TField>[]>
  /** Peers deduplicated by user id — one entry per remote user. */
  presenceUsers: ComputedRef<MultiplayerPeer<TField>[]>
  /** Remote connections currently typing. */
  typingPeers: ComputedRef<MultiplayerTypingPeer[]>
  /** Last `multiplayer:update` payload from another connection. */
  remoteUpdate: Ref<TUpdate | null>
  status: Ref<string>
  joinRoom: () => void
  leaveRoom: () => void
}
export type {
  MultiplayerLeaveMessage,
  MultiplayerMessage,
  MultiplayerPresenceMessage,
  MultiplayerTextCursor,
  MultiplayerTypingMessage,
  MultiplayerTypingTarget,
  MultiplayerUpdateMessage,
  MultiplayerUser,
} from '@rstore/multiplayer/protocol'
