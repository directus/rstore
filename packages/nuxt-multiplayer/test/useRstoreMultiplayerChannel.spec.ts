import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRstoreMultiplayerChannel } from '../src/runtime/composables/useRstoreMultiplayerChannel'
import { muteVueLifecycleWarnings, withScope } from './utils'

/**
 * Shared control surface for the mocked `useWebSocket`: captures the
 * `onMessage` callback (to inject frames) and every payload sent.
 */
const wsState = vi.hoisted(() => ({
  onMessage: undefined as ((ws: unknown, event: { data: string }) => void) | undefined,
  sent: [] as string[],
}))

vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue')
  return {
    useWebSocket: (_url: unknown, options?: { onMessage?: (ws: unknown, event: { data: string }) => void }) => {
      wsState.onMessage = options?.onMessage
      return {
        data: ref<string | null>(null),
        status: ref('OPEN'),
        send: (payload: string) => {
          wsState.sent.push(payload)
          return true
        },
        open: () => {},
        close: () => {},
      }
    },
  }
})

vi.mock('nuxt/app', () => ({
  useRuntimeConfig: () => ({ public: {} }),
}))

/** Injects a raw frame as if it came from the server. */
function receive(payload: Record<string, unknown>) {
  wsState.onMessage!(null, { data: JSON.stringify(payload) })
}

function presenceFrame(userId: string, clientId: string, roomId = 'room') {
  return {
    type: 'multiplayer:presence',
    roomId,
    clientId,
    user: { id: userId, name: userId, color: '#fff' },
  }
}

function createChannel() {
  return withScope(() => useRstoreMultiplayerChannel({
    roomId: 'room',
    endpoint: 'ws://test',
    user: { id: 'alice', name: 'Alice', color: '#f00' },
  }))
}

describe('useRstoreMultiplayerChannel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    wsState.onMessage = undefined
    wsState.sent = []
    muteVueLifecycleWarnings()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps an idle peer alive on identical heartbeat frames', () => {
    const { value: channel, dispose } = createChannel()

    receive(presenceFrame('bob', 'c-bob'))
    expect(channel.peers.value).toHaveLength(1)

    // 10s later the peer's heartbeat repeats the exact same payload — a
    // ws.data watcher would skip it (Object.is) and let the 15s stale
    // sweep evict a live peer; the onMessage path must refresh lastSeen.
    vi.advanceTimersByTime(10_000)
    receive(presenceFrame('bob', 'c-bob'))
    vi.advanceTimersByTime(10_000)

    expect(channel.peers.value).toHaveLength(1)

    // Sanity: with no further frames the peer eventually goes stale.
    vi.advanceTimersByTime(20_000)
    expect(channel.peers.value).toHaveLength(0)

    dispose()
  })

  it('filters self-echo by clientId, not user id', () => {
    const { value: channel, dispose } = createChannel()

    // Another tab of the same authenticated user (same id, new clientId).
    receive(presenceFrame('alice', 'c-other-tab'))
    expect(channel.peers.value).toHaveLength(1)
    expect(channel.peers.value[0]!.id).toBe('alice')

    // A true self-echo (same clientId) is ignored.
    receive(presenceFrame('alice', channel.clientId))
    expect(channel.peers.value).toHaveLength(1)

    dispose()
  })

  it('applies updates from another tab of the same user', () => {
    const { value: channel, dispose } = createChannel()

    receive({
      type: 'multiplayer:update',
      roomId: 'room',
      userId: 'alice',
      clientId: 'c-other-tab',
      data: { title: 'from other tab' },
    })
    expect(channel.remoteUpdate.value).toEqual({ title: 'from other tab' })

    // Echo of our own update is ignored.
    channel.remoteUpdate.value = null
    receive({
      type: 'multiplayer:update',
      roomId: 'room',
      userId: 'alice',
      clientId: channel.clientId,
      data: { title: 'self echo' },
    })
    expect(channel.remoteUpdate.value).toBeNull()

    dispose()
  })

  it('tracks one peer per connection and aggregates presence per user', () => {
    const { value: channel, dispose } = createChannel()

    receive(presenceFrame('bob', 'c-tab-1'))
    receive(presenceFrame('bob', 'c-tab-2'))

    expect(channel.peers.value).toHaveLength(2)
    expect(channel.presenceUsers.value).toHaveLength(1)
    expect(channel.presenceUsers.value[0]!.id).toBe('bob')

    // Leave removes only the matching connection, not the whole user.
    receive({ type: 'multiplayer:leave', roomId: 'room', userId: 'bob', clientId: 'c-tab-1' })
    expect(channel.peers.value).toHaveLength(1)
    expect(channel.peers.value[0]!.clientId).toBe('c-tab-2')
    expect(channel.presenceUsers.value).toHaveLength(1)

    dispose()
  })

  it('stamps outgoing frames with the connection clientId', () => {
    const { value: channel, dispose } = createChannel()

    channel.joinRoom()
    const lastSent = JSON.parse(wsState.sent.at(-1)!)
    expect(lastSent.clientId).toBe(channel.clientId)
    expect(lastSent.user.id).toBe('alice')

    dispose()
  })

  it('ignores frames for other rooms', () => {
    const { value: channel, dispose } = createChannel()

    receive(presenceFrame('bob', 'c-bob', 'other-room'))
    expect(channel.peers.value).toHaveLength(0)

    dispose()
  })
})
