import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from 'vite'
import type { RstoreDevtoolsViteOptions } from './options'
import { randomBytes } from 'node:crypto'
import process from 'node:process'
import { createRstoreDevframe } from '../devframe/definition'
import { createRstoreDevframeHost } from '../devframe/host'
import { normalizeRstoreBase } from '../devframe/paths'
import { resolveInspectorAssets, serveInspectorAssets } from './assets'

/** One relay lease per server prevents duplicate configuration listeners. */
const leases = new WeakMap<ViteDevServer['middlewares'], () => Promise<void>>()

/** Install shared-server transport and restricted same-origin producer bootstrap. */
export async function configureDevtoolsServer(server: ViteDevServer, options: RstoreDevtoolsViteOptions): Promise<() => Promise<void>> {
  await leases.get(server.middlewares)?.()
  const clientDir = resolveInspectorAssets(options.clientDir)
  const base = normalizeRstoreBase(`${options.applicationBase ?? server.config.base}${normalizeRstoreBase(options.base).slice(1)}`)
  const candidate = options.server ?? server.httpServer
  // HTTP/2 upgrades cannot use Node's HTTP/1 WebSocket adapter; use sidecar.
  const httpServer = candidate && 'updateSettings' in candidate ? undefined : candidate
  const authToken = randomBytes(32).toString('hex')
  const definition = createRstoreDevframe({
    basePath: base,
    authTokens: { browser: [authToken], node: options.clientAuthTokens, ssr: options.ssrAuthTokens },
  })
  /** Resolve actual allocated port after listen, never configuration's guessed port. */
  const origin = () => {
    if (options.origin?.())
      return options.origin()
    const address = candidate?.address()
    if (!address || typeof address === 'string')
      return ''
    const host = address.address === '::' || address.address === '0.0.0.0' ? 'localhost' : address.address
    return `${server.config.server.https ? 'https' : 'http'}://${host.includes(':') ? `[${host}]` : host}:${address.port}`
  }
  const relay = createRstoreDevframeHost(definition, {
    base,
    server: httpServer ?? undefined,
    ws: httpServer ? undefined : { sidecar: true },
    host: options.host ?? '127.0.0.1',
    origin,
    allowedOrigins: options.allowedOrigins,
    distDir: false,
    mcp: true,
    mcpAuthToken: process.env.DEVFRAME_MCP_AUTH_TOKEN,
  })
  await relay.ready
  let active = true
  /** Notify private consumers once listener provides genuine address. */
  const ready = () => options.onReady?.({ baseURL: `${origin()}${base}`, base })
  candidate?.once('listening', ready)
  if (candidate?.listening)
    ready()
  const middleware = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    if (!active)
      return next()
    const path = (req.url ?? '').split('?')[0]!
    if (!path.startsWith(base)) {
      if (path === base.slice(0, -1)) {
        res.writeHead(302, { Location: base }).end()
        return
      }
      return next()
    }
    const relative = path.slice(base.length)
    if (relative === 'bootstrap.json') {
      const boundOrigin = origin()
      const protocol = boundOrigin ? new URL(boundOrigin).protocol : server.config.server.https ? 'https:' : 'http:'
      const requestOrigin = `${protocol}//${req.headers.host}`
      const parsedOrigin = new URL(requestOrigin)
      const samePort = boundOrigin && parsedOrigin.port === new URL(boundOrigin).port
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname)
      const incomingOrigin = req.headers.origin
      if (((!loopback || !samePort) && requestOrigin !== boundOrigin) || req.headers['sec-fetch-site'] === 'cross-site' || (incomingOrigin && incomingOrigin !== requestOrigin) || req.method !== 'GET') {
        res.writeHead(403).end()
        return
      }
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ protocolVersion: 1, baseURL: `${requestOrigin}${base}`, authToken }))
      return
    }
    if (relative.startsWith('__')) {
      relay.nodeMiddleware(req, res, () => res.writeHead(404).end())
      return
    }
    void serveInspectorAssets(req, res, clientDir, relative).catch(next)
  }
  server.middlewares.use(middleware)
  // Restarted configuration must precede Vite's application-base stripping.
  const installed = server.middlewares.stack.pop()!
  server.middlewares.stack.unshift(installed)
  /** Release relay while middleware becomes inert after restart. */
  async function close() {
    if (!active)
      return
    active = false
    const layer = server.middlewares.stack.findIndex(item => item.handle === middleware)
    if (layer !== -1)
      server.middlewares.stack.splice(layer, 1)
    candidate?.off('listening', ready)
    candidate?.off('close', onClose)
    await relay.close()
  }
  /** Node close event cannot await callbacks; close lease owns completion. */
  function onClose() {
    void close()
  }
  leases.set(server.middlewares, close)
  candidate?.once('close', onClose)
  const closeServer = server.close.bind(server)
  server.close = async () => {
    await close()
    await closeServer()
  }
  return close
}
