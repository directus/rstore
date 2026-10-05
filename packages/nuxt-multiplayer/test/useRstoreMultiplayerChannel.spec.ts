import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useRstoreMultiplayerChannel } from '../src/runtime/composables/useRstoreMultiplayerChannel'
import { useRstoreMultiplayerTyping } from '../src/runtime/composables/useRstoreMultiplayerTyping'
import { withScope } from './utils'

/**
 * Shared control surface for the mocked `useWebSocket`: captures the
 * `onMessage` callback (to inject frames), every payload sent and the status.
 */
const wsState = vi.hoisted(() => ({
  onMessage: undefined as ((ws: unknown, event: { data: string }) => void) | undefined,
  sent: [] as string[],
  status: undefined as undefined | { value: string },
}))

vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue')
  return {
    useWebSocket: (_url: unknown, options?: { onMessage?: (ws: unknown, event: { data: string }) => void }) => {
      wsState.onMessage = options?.onMessage
      wsState.status = ref('OPEN')
      return {
        data: ref<string | null>(null),
        status: wsState.status,
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

function presenceFrame(userId: string, clientId: string) {
  return { type: 'multiplayer:presence', roomId: 'room', clientId, user: { id: userId, name: userId, color: '#fff' } }
}

function sentTypes() {
  return wsState.sent.map(text => JSON.parse(text).type)
}

function createChannel(options: { heartbeatInterval?: number } = {}) {
  return withScope(() => useRstoreMultiplayerChannel({
    roomId: 'room',
    endpoint: 'ws://test',
    user: { id: 'alice', name: 'Alice', color: '#f00' },
    ...options,
  }))
}

describe('useRstoreMultiplayerChannel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    wsState.sent = []
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('exposes peers, per-user presence and remote updates as refs', () => {
    const { value: channel, dispose } = createChannel()

    receive(presenceFrame('bob', 'c-tab-1'))
    receive(presenceFrame('bob', 'c-tab-2'))
    receive({ type: 'multiplayer:update', roomId: 'room', userId: 'bob', clientId: 'c-tab-1', data: { title: 'x' } })

    expect(channel.peers.value.map(peer => peer.clientId)).toEqual(['c-tab-1', 'c-tab-2'])
    expect(channel.presenceUsers.value.map(user => user.id)).toEqual(['bob'])
    expect(channel.remoteUpdate.value).toEqual({ title: 'x' })
    dispose()
  })

  it('sends presence when the socket opens, and heartbeats only while open', async () => {
    const { dispose } = createChannel({ heartbeatInterval: 1000 })

    wsState.status!.value = 'CLOSED'
    await nextTick()
    vi.advanceTimersByTime(3000)
    expect(sentTypes()).toEqual([])

    wsState.status!.value = 'OPEN'
    await nextTick()
    expect(sentTypes()).toEqual(['multiplayer:presence'])
    vi.advanceTimersByTime(1000)
    expect(sentTypes()).toEqual(['multiplayer:presence', 'multiplayer:presence'])
    dispose()
  })

  it('leaves the room and stops its timers when the scope is disposed', () => {
    const { dispose } = createChannel({ heartbeatInterval: 1000 })

    dispose()
    vi.advanceTimersByTime(5000)

    expect(sentTypes()).toEqual(['multiplayer:leave'])
  })

  it('warns about invalid frames in development only', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { dispose } = createChannel()

    vi.stubEnv('NODE_ENV', 'production')
    receive({ type: 'unknown' })
    expect(warn).not.toHaveBeenCalled()

    vi.stubEnv('NODE_ENV', 'development')
    receive({ type: 'unknown' })
    expect(warn).toHaveBeenCalledWith('[rstore-multiplayer] Dropped invalid message:', { type: 'unknown' })
    dispose()
  })
})

describe('useRstoreMultiplayerTyping', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    wsState.sent = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the users typing on its target and announces local typing', () => {
    const { value, dispose } = withScope(() => {
      const channel = useRstoreMultiplayerChannel({ roomId: 'room', endpoint: 'ws://test', user: { id: 'alice', name: 'Alice', color: '#f00' } })
      return { channel, typing: useRstoreMultiplayerTyping(channel, { collection: 'todos', key: 1, field: 'title' }) }
    })
    receive(presenceFrame('bob', 'c-bob'))
    receive(presenceFrame('carol', 'c-carol'))

    receive({ type: 'multiplayer:typing', roomId: 'room', userId: 'bob', clientId: 'c-bob', target: { collection: 'todos', key: 1, field: 'title' } })
    receive({ type: 'multiplayer:typing', roomId: 'room', userId: 'carol', clientId: 'c-carol', target: { collection: 'todos', key: 1, field: 'body' } })
    expect(value.typing.typingUsers.value.map(user => user.name)).toEqual(['bob'])

    value.typing.onInput()
    value.typing.onBlur()
    expect(wsState.sent.map(text => JSON.parse(text)).filter(frame => frame.type === 'multiplayer:typing').map(frame => frame.target))
      .toEqual([{ collection: 'todos', key: 1, field: 'title' }, null])
    dispose()
  })
})
