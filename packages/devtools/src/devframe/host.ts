import type { DevframeInstance, InitDevframeOptions } from 'devframe/initiate'
import type { RstoreDevframeDefinition } from './options'
import { initDevframe } from 'devframe/initiate'

/** One concise setup hint per process, shared by Vite/Nuxt/CLI wrappers. */
let missingMcpHintPrinted = false

/** Required auth and ownership callbacks cannot be overridden by host configuration. */
export interface RstoreDevframeHostOptions extends Omit<InitDevframeOptions, 'auth' | 'onPeerDisconnect' | 'mcp'> {
  /** HTTP MCP bearer credential; missing token disables HTTP MCP. */
  mcpAuthToken?: string
  /** Mount agent HTTP endpoint only when caller opts in with bearer. */
  mcp?: boolean
}
/** Mount with Devframe's handler, preserving private producer and HTTP MCP gates. */
export function createRstoreDevframeHost(definition: RstoreDevframeDefinition, options: RstoreDevframeHostOptions): DevframeInstance {
  const { mcpAuthToken, mcp, ...host } = options
  if (mcpAuthToken !== undefined)
    definition.relay.rejectCredential(mcpAuthToken)
  if (mcp && !mcpAuthToken && !missingMcpHintPrinted) {
    missingMcpHintPrinted = true
    console.error('RStore HTTP MCP disabled: set DEVFRAME_MCP_AUTH_TOKEN.')
  }
  const instance = initDevframe(definition, {
    ...host,
    auth: definition.relay.auth,
    onPeerDisconnect: definition.relay.onPeerDisconnect,
    mcp: mcp && mcpAuthToken ? { authorization: mcpAuthToken } : false,
  })
  const close = instance.close
  const middleware = instance.nodeMiddleware
  const handler = instance.handler
  /** Public descriptor bootstraps upstream viewer-origin registration; no role tokens. */
  function isDiscovery(url: string) {
    return new URL(url, 'http://localhost').pathname === `${instance.base}__connection.json`
  }
  instance.nodeMiddleware = (request, response, next) => {
    if (isDiscovery(request.url ?? ''))
      response.setHeader('Access-Control-Allow-Origin', '*')
    middleware(request, response, next)
  }
  instance.handler = async (request) => {
    const response = await handler(request)
    if (!isDiscovery(request.url))
      return response
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
  instance.close = async () => {
    definition.relay.dispose()
    await close()
  }
  return instance
}
