import type { ConnectionMeta } from 'devframe'
import type { ActionResult, ReadReply, SessionSummary } from '../../src/protocol'
import type { RuntimeInvalidation } from '../../src/runtime/types'
import type { ConnectionStatus, InspectorTransport } from './types'
import { authenticateWithUrlOtp, registerDevframeViewerOrigin, resolveWsUrl } from 'devframe/client'
import { DEVFRAME_EVENTS } from 'devframe/constants'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import * as v from 'valibot'
import { parseAction, ReadSchemas } from '../../src/protocol'

/** Official discovery/origin handshake plus low-level channel, retaining tokens only in memory. */
export async function connectRelay(baseURL: string, authToken?: string): Promise<InspectorTransport> {
  const base = new URL(baseURL, window.location.href)
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
    throw new Error('Expected HTTP relay URL without embedded credentials')
  if (!base.pathname.endsWith('/'))
    base.pathname += '/'
  const descriptorURL = new URL('__connection.json', base)
  const response = await fetch(descriptorURL, { signal: AbortSignal.timeout(10000), cache: 'no-store' })
  if (!response.ok)
    throw new Error('Devtools relay discovery unavailable')
  const connectionMeta = await response.json() as ConnectionMeta
  if (!connectionMeta.websocket)
    throw new Error('Relay does not advertise WebSocket RPC')
  await registerDevframeViewerOrigin({ connectionMeta, metaBaseUrl: descriptorURL.href, authToken })
  const listeners = new Set<(event: RuntimeInvalidation) => void>()
  const statuses = new Set<(status: ConnectionStatus) => void>()
  let closeRpc: (() => void) | undefined
  const url = resolveWsUrl(connectionMeta.websocket, descriptorURL.href, window.location)
  const channel = createWsRpcChannel({
    url,
    definitions: new Map((connectionMeta.jsonSerializableMethods ?? []).map(name => [name, { jsonSerializable: true }])),
    onDisconnected: () => {
      closeRpc?.()
      statuses.forEach(listener => listener('disconnected'))
    },
    onError: () => statuses.forEach(listener => listener('disconnected')),
  })
  const rpc = createRpcClient<Record<string, (...args: any[]) => any>, Record<string, (...args: any[]) => any>>({
    'rstore:invalidate': (event: RuntimeInvalidation) => listeners.forEach(listener => listener(event)),
    [DEVFRAME_EVENTS.broadcast.authRevoked]: () => statuses.forEach(listener => listener('authentication-error')),
  }, { channel, rpcOptions: { timeout: 30000 } })
  closeRpc = rpc.$close
  try {
    let trusted = false
    // Official one-time fragment consumer removes URL/history code. The exchange
    // trusts this peer directly; bearer token never enters URL or browser storage.
    await authenticateWithUrlOtp({
      get isTrusted() { return trusted },
      async requestTrustWithCode(code) {
        const reply = await rpc.$call('anonymous:devframe:auth:exchange', { code, ua: navigator.userAgent, origin: location.origin })
        trusted = !!reply?.authToken
        return trusted
      },
    })
    if (!trusted) {
      const trust = await rpc.$call('anonymous:devframe:auth', { authToken: authToken ?? '', ua: navigator.userAgent, origin: location.origin })
      trusted = !!trust?.isTrusted
    }
    if (!trusted)
      throw Object.assign(new Error('Relay authentication rejected'), { kind: 'auth' })
  }
  catch (error) {
    rpc.$close()
    channel.close()
    throw error
  }
  return {
    listSessions: () => rpc.$call('rstore:list-sessions', {}) as Promise<SessionSummary[]>,
    read: (view, target, parameters = {}) => rpc.$call(`rstore:get-${view}`, v.parse(ReadSchemas[`rstore:get-${view}`], { target, ...parameters })) as Promise<ReadReply>,
    action: action => rpc.$call(`rstore:${action.action}`, parseAction(action)) as Promise<ActionResult>,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    onStatus(listener) {
      statuses.add(listener)
      return () => {
        statuses.delete(listener)
      }
    },
    async watch(target, view) {
      const { watchId } = await rpc.$call('rstore:watch', { target, view }) as { watchId: string }
      return () => {
        void rpc.$call('rstore:unwatch', { watchId }).catch(() => {})
      }
    },
    dispose() {
      listeners.clear()
      statuses.clear()
      rpc.$close()
      channel.close()
    },
  }
}
