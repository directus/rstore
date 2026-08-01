/**
 * Gate that tracks whether the realtime websocket handshake completed.
 *
 * The realtime plugin blocks mutations (`beforeMutation`) on this gate so
 * the server knows the tab's `clientId` before any echo can arrive. The
 * gate must ALWAYS eventually settle — a handshake that never completes
 * (server rejected init, proxy stripped the upgrade, endpoint down) must
 * degrade to "no echo suppression", never to "mutations hang forever".
 */
export interface RealtimeReadyGate {
  /** Resolves once the gate is ready (ack received, failure, or timeout). */
  wait: () => Promise<void>
  /** Marks the handshake as complete and clears the pending timeout. */
  markReady: () => void
  /** Re-arms the gate (new promise + timeout). No-op after `disable()`. */
  reset: () => void
  /**
   * Permanently settles the gate: resolves the current promise and makes
   * further `reset()` calls no-ops. Used when the server refused the
   * handshake for good (e.g. protocol version mismatch) — the socket close
   * that follows triggers a `reset()` which must not re-block mutations.
   */
  disable: () => void
}

/**
 * Creates a {@link RealtimeReadyGate}. The gate starts unready with the
 * timeout armed.
 *
 * @param options Gate options.
 * @param options.timeoutMs How long `wait()` may block before force-resolving.
 * @param options.onTimeout Called when the timeout fires (e.g. to warn).
 */
export function createRealtimeReadyGate({ timeoutMs = 10_000, onTimeout }: {
  timeoutMs?: number
  onTimeout?: () => void
} = {}): RealtimeReadyGate {
  let resolveFn: (() => void) | undefined
  let promise!: Promise<void>
  let timer: ReturnType<typeof setTimeout> | undefined
  let disabled = false

  /** Clears the pending force-resolve timer, if any. */
  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  /** Resolves the current promise and clears the timer. */
  function settle() {
    clearTimer()
    resolveFn?.()
    resolveFn = undefined
  }

  /** Creates a fresh pending promise and arms the force-resolve timeout. */
  function arm() {
    // Settle any previous waiters first so no promise is ever abandoned.
    resolveFn?.()
    promise = new Promise<void>((resolve) => {
      resolveFn = resolve
    })
    clearTimer()
    timer = setTimeout(() => {
      onTimeout?.()
      settle()
    }, timeoutMs)
  }

  arm()

  return {
    wait: () => promise,
    markReady: settle,
    reset: () => {
      if (!disabled) {
        arm()
      }
    },
    disable: () => {
      disabled = true
      settle()
    },
  }
}
