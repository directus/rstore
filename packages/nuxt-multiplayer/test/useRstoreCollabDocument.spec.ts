import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, watch } from 'vue'
import { useRstoreCollabDocument } from '../src/runtime/composables/useRstoreCollabDocument'
import { withScope } from './utils'

/** Control surface of the mocked `useWebSocket`. */
const ws = vi.hoisted(() => ({
  url: undefined as unknown,
  onMessage: undefined as ((socket: unknown, event: { data: string }) => void) | undefined,
  sent: [] as any[],
  status: undefined as undefined | { value: string },
  closed: 0,
}))

vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue')
  return {
    useWebSocket: (url: unknown, options?: { onMessage?: (socket: unknown, event: { data: string }) => void }) => {
      ws.url = url
      ws.onMessage = options?.onMessage
      ws.status = ref('CONNECTING')
      return {
        status: ws.status,
        send: (payload: string) => {
          ws.sent.push(JSON.parse(payload))
          return true
        },
        close: () => {
          ws.closed++
        },
      }
    },
  }
})

const store = vi.hoisted(() => ({
  $collections: [{ name: 'docNodes' }],
  $cache: { writeItems: vi.fn(), addLayer: vi.fn(), getLayer: vi.fn(), removeLayer: vi.fn() },
}))

vi.mock('nuxt/app', () => ({
  useRuntimeConfig: () => ({ public: { rstoreMultiplayerEndpoint: '/api/custom/ws' } }),
  useNuxtApp: () => ({ $rstore: store }),
}))

const node = { id: 'p1', docId: 'doc', parentId: null, orderKey: 'a0', type: 'paragraph', attrs: {}, content: [{ insert: 'hi' }], deleted: false, version: 3 }

/** Delivers a server frame. */
function receive(frame: Record<string, unknown>) {
  ws.onMessage!(null, { data: JSON.stringify(frame) })
}

/** Opens the socket and answers the hello with a snapshot. */
async function open() {
  ws.status!.value = 'OPEN'
  await nextTick()
  const hello = ws.sent.at(-1)
  receive({ type: 'collab:welcome', docId: 'doc', protocol: 2, version: 3, ch: hello.ch })
  receive({ type: 'collab:snapshot', ch: hello.ch, version: 3, nodes: [node] })
  return hello
}

describe('useRstoreCollabDocument', () => {
  afterEach(() => {
    ws.sent.length = 0
    ws.closed = 0
    vi.clearAllMocks()
  })

  it('opens the document on the multiplayer endpoint and exposes its reactive state', async () => {
    const { value: doc, dispose } = withScope(() => useRstoreCollabDocument('doc', { clientId: 'me' }))
    expect(ws.url).toBe('/api/custom/ws')
    expect(doc.loaded.value).toBe(false)

    const hello = await open()
    expect(hello).toMatchObject({ type: 'collab:hello', docId: 'doc', clientId: 'me' })
    expect(doc.loaded.value).toBe(true)
    expect(doc.state.value.nodes.get('p1')).toMatchObject({ content: [{ insert: 'hi' }] })

    const seen: string[] = []
    watch(doc.state, state => seen.push(String(state.nodes.get('p1')!.content![0]!.insert)), { flush: 'sync' })
    doc.submit([{ t: 'text', node: 'p1', ops: [{ retain: 2 }, { insert: '!' }] }])
    expect(seen).toEqual(['hi!'])
    expect(ws.sent.at(-1)).toEqual({ type: 'collab:submit', ch: hello.ch, seq: 1, baseVersion: 3, ops: [{ t: 'text', node: 'p1', ops: [{ retain: 2 }, { insert: '!' }] }] })
    expect(doc.status.value).toBe('awaiting')
    dispose()
  })

  it('resumes from the confirmed version after a reconnect', async () => {
    const { dispose } = withScope(() => useRstoreCollabDocument('doc'))
    await open()
    ws.status!.value = 'CLOSED'
    await nextTick()
    ws.status!.value = 'OPEN'
    await nextTick()
    expect(ws.sent.at(-1)).toMatchObject({ type: 'collab:hello', baseVersion: 3 })
    dispose()
  })

  it('mirrors the document into the store collection and stops on dispose', async () => {
    const { dispose } = withScope(() => useRstoreCollabDocument('doc', { collection: 'docNodes' }))
    await open()
    expect(store.$cache.writeItems).toHaveBeenCalledWith({ collection: store.$collections[0], items: [{ key: 'p1', value: node }] })
    dispose()
    expect(store.$cache.removeLayer).toHaveBeenCalledWith('multiplayer-ot:doc')
    expect(ws.closed).toBe(1)
  })
})
