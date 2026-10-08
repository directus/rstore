import type { IncomingMessage } from 'node:http'
import type { Plugin } from 'vite'
import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'

/** Native sockets supplied by Vite's installed ws dependency. */
interface RelaySocket {
  /** WebSocket OPEN state is 1. */
  readyState: number
  /** Deliver wire data to a native browser client. */
  send: (data: string) => void
  /** Close independent of client cleanup behavior. */
  terminate: () => void
  /** Observe messages emitted by real clients. */
  on: (event: 'message', listener: (data: { toString: () => string }) => void) => void
}

/** Socket and immutable frames acquired independently of client discovery. */
interface RelaySession {
  /** Native sockets retained for deterministic teardown. */
  sockets: Set<RelaySocket>
  /** Parsed copies captured at the network boundary. */
  frames: Record<string, unknown>[]
}

/** Read bounded fixture POST bodies; production protocol stays in the client. */
async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
    if (chunks.reduce((size, item) => size + item.length, 0) > 65_536)
      throw new Error('Multiplayer fixture body exceeds 64 KiB')
  }
  return Buffer.concat(chunks).toString()
}

/**
 * External transport fixture: raw echo relay, deliberate server injections and
 * independent wire observations. No channel/form/filter behavior is reproduced.
 */
export function multiplayerRelay(): Plugin {
  const require = createRequire(import.meta.url)
  const viteRequire = createRequire(require.resolve('vite/package.json'))
  const { WebSocketServer } = viteRequire('ws')
  const sessions = new Map<string, RelaySession>()
  let closeRelay: (() => void) | undefined
  return {
    name: 'rstore-multiplayer-relay',
    configureServer(server) {
      const relay = new WebSocketServer({ noServer: true })
      let closed = false
      /** Release upgraded sockets before HTTP server shutdown waits on them. */
      closeRelay = () => {
        if (closed)
          return
        closed = true
        for (const session of sessions.values()) {
          for (const peer of session.sockets)
            peer.terminate()
        }
        sessions.clear()
        relay.close()
      }
      /** Get fixture session shared by HTTP control and socket upgrades. */
      function sessionFor(url: URL): RelaySession {
        const id = url.searchParams.get('session') ?? ''
        let session = sessions.get(id)
        if (!session) {
          session = { sockets: new Set(), frames: [] }
          sessions.set(id, session)
        }
        return session
      }
      server.httpServer?.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1')
        if (url.pathname !== '/__multiplayer')
          return
        relay.handleUpgrade(request, socket, head, (peer: RelaySocket) => {
          const session = sessionFor(url)
          session.sockets.add(peer)
          peer.on('message', (data) => {
            const raw = data.toString()
            session.frames.push(JSON.parse(raw))
            for (const recipient of session.sockets) {
              if (recipient.readyState === 1)
                recipient.send(raw)
            }
          })
        })
      })
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1')
        if (!url.pathname.startsWith('/__multiplayer/'))
          return next()
        const session = sessionFor(url)
        try {
          if (url.pathname === '/__multiplayer/send') {
            const raw = await readBody(request)
            for (const peer of session.sockets) {
              if (peer.readyState === 1)
                peer.send(raw)
            }
          }
          else if (url.pathname === '/__multiplayer/dispose') {
            for (const peer of session.sockets)
              peer.terminate()
            sessions.delete(url.searchParams.get('session') ?? '')
          }
          response.setHeader('Content-Type', 'application/json')
          response.end(JSON.stringify({
            frames: session.frames,
            open: Array.from(session.sockets).filter(peer => peer.readyState === 1).length,
          }))
        }
        catch (error) {
          response.statusCode = 500
          response.end(String(error))
        }
      })
      server.httpServer?.on('close', closeRelay)
    },
    closeBundle() {
      closeRelay?.()
    },
  }
}
