import type { CollabClient, CollabClientOptions, DocOp, DocState } from '@rstore/multiplayer/ot'
import type { CollabWireClientMessage, CollabWireServerMessage } from '@rstore/multiplayer/protocol'
import type { CollabServerOptions, MemoryOpLogStore } from '@rstore/multiplayer/server'
import type { NodeSpec } from './docs'
import { createCollabClient } from '@rstore/multiplayer/ot'
import { createCollabServer, createMemoryOpLogStore } from '@rstore/multiplayer/server'
import { buildNodes } from './docs'

/** One simulated connection: FIFO queues in both directions (like a WebSocket). */
interface Link {
  up: CollabWireClientMessage[]
  down: CollabWireServerMessage[]
  online: boolean
}

/** A client of the simulation with its link. */
export interface SimClient {
  name: string
  client: CollabClient
  /** Local edit (applied immediately, sent when possible). */
  edit: (ops: DocOp[] | ((state: DocState) => DocOp[])) => void
}

/** Options of `createSimulation`. */
export interface SimulationOptions {
  clients?: string[]
  server?: Omit<CollabServerOptions, 'store'>
  client?: Partial<CollabClientOptions>
  store?: MemoryOpLogStore
  /** Per-client options (user ids for permission hooks). */
  userIds?: Record<string, string>
  /** Seed the store with `specs`. Pass `false` to reuse an existing document. @default true */
  seed?: boolean
}

/**
 * A sequencer, an in-memory op log and N clients connected through FIFO
 * links whose delivery the test controls (order, delay, disconnects).
 */
export async function createSimulation(specs: NodeSpec[], options: SimulationOptions = {}) {
  const docId = 'doc'
  const store = options.store ?? createMemoryOpLogStore()
  if (options.seed !== false) {
    store.seed(docId, buildNodes(specs, docId), 0)
  }
  const server = createCollabServer({ ...options.server, store })
  const links = new Map<string, Link>()
  const clients: Record<string, SimClient> = {}

  for (const name of options.clients ?? ['A', 'B']) {
    const link: Link = { up: [], down: [], online: true }
    links.set(name, link)
    const client = createCollabClient({
      docId,
      clientId: name,
      ...options.client,
      // Frames are copied like a real transport serializes them, so aliasing bugs show.
      send: frame => link.online && link.up.push(structuredClone(frame)),
    })
    clients[name] = {
      name,
      client,
      edit: ops => client.submit(typeof ops === 'function' ? ops(client.state) : ops),
    }
  }

  /** The server-side peer of a client: frames are queued on its link. */
  const peerOf = (name: string) => ({
    id: name,
    userId: options.userIds?.[name] ?? name,
    send: (frame: CollabWireServerMessage) => {
      const link = links.get(name)!
      if (link.online) {
        link.down.push(structuredClone(frame))
      }
    },
  })

  /** Delivers queued client frames to the server, in FIFO order. */
  async function deliverUp(name: string, count = Number.POSITIVE_INFINITY) {
    const link = links.get(name)!
    while (link.up.length && count-- > 0) {
      await server.handleMessage(peerOf(name), link.up.shift()!)
    }
  }

  /** Delivers queued server frames to a client. */
  function deliverDown(name: string, count = Number.POSITIVE_INFINITY) {
    const link = links.get(name)!
    while (link.down.length && count-- > 0) {
      clients[name]!.client.receive(link.down.shift()!)
    }
  }

  /** Delivers everything until no frame is in flight. */
  async function flush() {
    for (let guard = 0; guard < 100_000; guard++) {
      let moved = false
      for (const [name, link] of links) {
        if (link.up.length) {
          moved = true
          await deliverUp(name)
        }
        if (link.down.length) {
          moved = true
          deliverDown(name)
        }
      }
      if (!moved) {
        return
      }
    }
    throw new Error('simulation did not settle')
  }

  /** Drops the link: queued frames are lost, the client keeps editing offline. */
  function disconnect(name: string) {
    const link = links.get(name)!
    link.online = false
    link.up.length = 0
    link.down.length = 0
    clients[name]!.client.disconnect()
    server.handleClose(name)
  }

  /** Re-opens the link and replays the hello (catch-up and pending resubmit). */
  function reconnect(name: string) {
    links.get(name)!.online = true
    clients[name]!.client.connect()
  }

  /** The authoritative document. */
  async function serverState(): Promise<DocState> {
    return store.state(docId)
  }

  for (const name of Object.keys(clients)) {
    clients[name]!.client.connect()
  }
  await flush()

  return { docId, store, server, clients, links, deliverUp, deliverDown, flush, disconnect, reconnect, serverState }
}

/** Simulation handle. */
export type Simulation = Awaited<ReturnType<typeof createSimulation>>
