import type { MaybeRefOrGetter } from 'vue'
import type { MultiplayerPeer, MultiplayerTypingTarget } from '../types'
import type { RstoreMultiplayerChannel } from './useRstoreMultiplayerChannel'
import { isSameTypingTarget } from '@rstore/multiplayer/presence'
import { computed, toValue } from 'vue'

/**
 * Typing indicators for one target (a record, optionally one field): who is
 * typing there, and handlers announcing local typing. Frames never carry the
 * typed content.
 */
export function useRstoreMultiplayerTyping<TField extends string>(
  channel: RstoreMultiplayerChannel<any, TField>,
  target: MaybeRefOrGetter<MultiplayerTypingTarget>,
) {
  /** Remote connections typing on the target, with their presence (name, color). */
  const typingUsers = computed(() => {
    const current = toValue(target)
    return channel.typingPeers.value
      .filter(entry => isSameTypingTarget(entry.target, current))
      .map(entry => channel.peers.value.find(peer => peer.clientId === entry.clientId))
      .filter((peer): peer is MultiplayerPeer<TField> => !!peer)
  })

  return {
    typingUsers,
    /** Call on every input event of the target. */
    onInput: () => channel.notifyTyping(toValue(target)),
    /** Call when the target loses focus. */
    onBlur: () => channel.stopTyping(),
  }
}
