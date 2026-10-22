import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { RstoreDevtools } from '../../src/runtime/types'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { openRelayRpc } from '../../src/node/rpc'

/** Real allocated loopback relay, owned from acquisition through failure cleanup. */
export async function startRelay(options: { mcp?: boolean, port?: number, nodeToken?: string, runtime?: RstoreDevtools, serveClient?: boolean, onUpgrade?: (request: IncomingMessage, socket: Duplex) => void } = {}) {
  // Dynamic ESM import preserves the public import condition in Playwright's
  // CommonJS worker; Vitest source aliases still exercise current source.
  const { createRstoreDevframe, createRstoreDevframeHost } = await import('@rstore/devtools/node')
  const nodeToken = options.nodeToken ?? randomUUID()
  const viewerToken = randomUUID()
  const mcpToken = randomUUID()
  const ssrToken = randomUUID()
  const server = createServer()
  const definition = createRstoreDevframe({ runtime: options.runtime, authTokens: { node: [nodeToken], viewer: [viewerToken], ssr: [ssrToken] } })
  const instance = createRstoreDevframeHost(definition, { base: '/nested/__rstore/', server, mcp: options.mcp, mcpAuthToken: options.mcp ? mcpToken : undefined, ...(options.serveClient ? {} : { distDir: false }), getStorageDir: () => '/tmp/rstore-relay-test' })
  server.on('request', instance.nodeMiddleware)
  if (options.onUpgrade)
    server.on('upgrade', options.onUpgrade)
  try {
    await instance.ready
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(options.port ?? 0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Allocated relay port unavailable')
    return {
      nodeToken,
      viewerToken,
      mcpToken,
      ssrToken,
      baseURL: `http://127.0.0.1:${address.port}/nested/__rstore/`,
      /** Mint same single-use authentication fragment opened by CLI --open. */
      openURL: () => definition.relay.auth.buildOpenUrl!(`http://127.0.0.1:${address.port}/nested/__rstore/`),
      mcpURL: options.mcp ? `http://127.0.0.1:${address.port}/nested/__rstore/${instance.connectionMeta().mcp!.path}` : undefined,
      async close() {
        await instance.close()
        await new Promise<void>(resolve => server.close(() => resolve()))
      },
    }
  }
  catch (error) {
    await instance.close()
    server.close()
    throw error
  }
}
/** Viewer uses real official channel and closes both birpc and socket. */
export async function openViewer(host: Awaited<ReturnType<typeof startRelay>>) {
  const connection = await openRelayRpc({ baseURL: host.baseURL, authToken: host.viewerToken })
  const close = connection.rpc.$close
  connection.rpc.$close = (...args) => {
    close(...args)
    connection.close()
  }
  return connection.rpc
}
/** Await observable contract condition with bounded retry, not fixed delay. */
export async function waitFor(condition: () => Promise<boolean>, timeout = 3000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await condition())
      return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Relay contract did not become observable before deadline')
}
