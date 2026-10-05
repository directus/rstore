import type { MultiplayerTypingTarget } from '../protocol/types.js'
import type { MultiplayerTypingPeer } from './types.js'

/** Whether two typing targets designate the same record field. */
export function isSameTypingTarget(left: MultiplayerTypingTarget | null, right: MultiplayerTypingTarget | null): boolean {
  return left?.collection === right?.collection
    && left?.key === right?.key
    && left?.field === right?.field
}

/**
 * Typing indicators of remote connections. Each entry expires `timeoutMs`
 * after its last frame (peers refresh it while they type), and is removed at
 * once by a `null` target or when the connection leaves.
 */
export function createTypingTracker(options: { timeoutMs: number, onChange: () => void }) {
  const entries = new Map<string, { peer: MultiplayerTypingPeer, timer: ReturnType<typeof setTimeout> }>()

  /** Remove the indicator of `clientId`. Returns whether there was one. */
  function remove(clientId: string): boolean {
    const entry = entries.get(clientId)
    if (!entry)
      return false
    clearTimeout(entry.timer)
    entries.delete(clientId)
    return true
  }

  return {
    /** Apply a typing frame: start or refresh the indicator, or clear it (`target: null`). */
    set(clientId: string, userId: string, target: MultiplayerTypingTarget | null): void {
      const removed = remove(clientId)
      if (!target) {
        if (removed)
          options.onChange()
        return
      }
      const timer = setTimeout(() => {
        entries.delete(clientId)
        options.onChange()
      }, options.timeoutMs)
      entries.set(clientId, { peer: { clientId, userId, target }, timer })
      options.onChange()
    },
    /** Clear the indicator of a connection that left. */
    remove(clientId: string): void {
      if (remove(clientId))
        options.onChange()
    },
    list(): MultiplayerTypingPeer[] {
      return Array.from(entries.values(), entry => entry.peer)
    },
    /** Clear every timer. */
    dispose(): void {
      for (const clientId of [...entries.keys()])
        remove(clientId)
    },
  }
}

/**
 * Local typing state: decides when a keystroke must be announced. A frame is
 * sent when the target changes or `throttleMs` after the previous one, so
 * peers keep refreshing their `timeoutMs` expiry while the user types.
 */
export function createLocalTyping(options: { throttleMs: number, timeoutMs: number, now: () => number }) {
  let target: MultiplayerTypingTarget | null = null
  let sentAt = Number.NEGATIVE_INFINITY

  return {
    /** Record a keystroke on `next`. Returns whether a frame must be sent. */
    notify(next: MultiplayerTypingTarget): boolean {
      const now = options.now()
      if (isSameTypingTarget(target, next) && now - sentAt < options.throttleMs)
        return false
      target = next
      sentAt = now
      return true
    },
    /**
     * Stop typing. Returns whether peers may still show the indicator, in
     * which case a `null` frame must be sent.
     */
    stop(): boolean {
      const active = target !== null && options.now() - sentAt < options.timeoutMs
      target = null
      sentAt = Number.NEGATIVE_INFINITY
      return active
    },
  }
}
