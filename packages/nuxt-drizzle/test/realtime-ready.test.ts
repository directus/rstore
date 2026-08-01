import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRealtimeReadyGate } from '../src/runtime/utils/realtime-ready'

// The realtime plugin blocks every mutation on the handshake ack
// (`beforeMutation` awaits the gate). Before the fix, an init failure or a
// proxy that strips the websocket upgrade left the promise pending forever
// and re-armed it on every reconnect attempt — every mutation hung
// indefinitely. The gate must always settle: on ack, on explicit failure,
// or via timeout.

/** Tracks whether a gate.wait() promise has settled. */
function track(promise: Promise<void>) {
  const state = { settled: false }
  void promise.then(() => {
    state.settled = true
  })
  return state
}

/** Flushes pending microtasks so `track` observes resolutions. */
async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('createRealtimeReadyGate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('wait() stays pending until markReady()', async () => {
    const gate = createRealtimeReadyGate({ timeoutMs: 10_000 })
    const state = track(gate.wait())
    await flush()
    expect(state.settled).toBe(false)

    gate.markReady()
    await flush()
    expect(state.settled).toBe(true)
  })

  it('wait() resolves immediately once ready', async () => {
    const gate = createRealtimeReadyGate({ timeoutMs: 10_000 })
    gate.markReady()
    const state = track(gate.wait())
    await flush()
    expect(state.settled).toBe(true)
  })

  it('reset() re-arms the gate after it was ready', async () => {
    const gate = createRealtimeReadyGate({ timeoutMs: 10_000 })
    gate.markReady()
    gate.reset()
    const state = track(gate.wait())
    await flush()
    expect(state.settled).toBe(false)
    gate.markReady()
    await flush()
    expect(state.settled).toBe(true)
  })

  it('resolves via timeout and reports it, instead of hanging forever', async () => {
    const onTimeout = vi.fn()
    const gate = createRealtimeReadyGate({ timeoutMs: 10_000, onTimeout })
    const state = track(gate.wait())

    await vi.advanceTimersByTimeAsync(9_999)
    expect(state.settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(state.settled).toBe(true)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('re-arms the timeout on reset()', async () => {
    const onTimeout = vi.fn()
    const gate = createRealtimeReadyGate({ timeoutMs: 10_000, onTimeout })
    gate.markReady()
    gate.reset()
    const state = track(gate.wait())
    await vi.advanceTimersByTimeAsync(10_000)
    await flush()
    expect(state.settled).toBe(true)
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('does not fire the timeout after markReady()', async () => {
    const onTimeout = vi.fn()
    const gate = createRealtimeReadyGate({ timeoutMs: 10_000, onTimeout })
    gate.markReady()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('disable() settles the gate permanently — reset() no longer re-arms', async () => {
    // Used when the server refuses the handshake (e.g. version mismatch):
    // the socket then closes, which triggers a reset — that reset must not
    // re-block mutations forever.
    const onTimeout = vi.fn()
    const gate = createRealtimeReadyGate({ timeoutMs: 10_000, onTimeout })
    gate.disable()
    gate.reset()
    const state = track(gate.wait())
    await flush()
    expect(state.settled).toBe(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(onTimeout).not.toHaveBeenCalled()
  })
})
