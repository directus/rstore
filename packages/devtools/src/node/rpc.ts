import type { ConnectionMeta } from 'devframe'
import { resolveWsUrl } from 'devframe/client'
import { createRpcClient } from 'devframe/rpc/client'
import { createWsRpcChannel } from 'devframe/rpc/transports/ws-client'
import * as v from 'valibot'
import { producerBaseURL } from '../devframe/paths'
import { DevtoolsError, ProtocolErrorSchema } from '../protocol'

/** Connection parameters shared by explicit Node and browser producers. */
export interface RelayConnectionOptions {
  /** Absolute HTTP discovery base, independent from asset URL. */
  baseURL: string
  /** Server-issued producer or viewer bearer credential. */
  authToken?: string
}
/** Official wire client; dynamic private/public methods share upstream dispatch. */
export type RelayRpc = ReturnType<typeof createRpcClient<Record<string, (...args: any[]) => any>, Record<string, (...args: any[]) => any>>>
/** Discover advertised WS route, then authenticate without inventing RPC framing. */
export async function openRelayRpc(options: RelayConnectionOptions, functions: Record<string, (...args: any[]) => any> = {}, onDisconnected?: () => void): Promise<{ rpc: RelayRpc, close: () => void }> {
  const base = producerBaseURL(options.baseURL)
  const descriptorURL = new URL('__connection.json', base)
  const response = await fetch(descriptorURL, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok)
    throw new Error('Devtools relay discovery unavailable')
  const meta = await response.json() as ConnectionMeta
  if (!meta.websocket)
    throw new Error('Devtools relay does not advertise WebSocket RPC')
  const url = resolveWsUrl(meta.websocket, descriptorURL.href, { protocol: base.protocol, host: base.host, hostname: base.hostname, href: base.href })
  let disconnected = false
  let channel: ReturnType<typeof createWsRpcChannel>
  const rpc = createRpcClient<Record<string, (...args: any[]) => any>, Record<string, (...args: any[]) => any>>(functions, {
    channel: channel = createWsRpcChannel({
      url,
      onDisconnected() {
        disconnected = true
        rpc.$close()
        onDisconnected?.()
      },
    }),
    rpcOptions: { timeout: 30_000 },
  })
  const closeRpc = rpc.$close
  const call = rpc.$call
  // Rehydrate plain shared errors; retain upstream errors for auth/transport.
  rpc.$call = async (method, ...args) => {
    try {
      return await call(method, ...args)
    }
    catch (error) {
      const parsed = v.safeParse(ProtocolErrorSchema, error)
      if (parsed.success)
        throw new DevtoolsError(parsed.output)
      throw error
    }
  }
  const close = () => {
    closeRpc()
    channel.close()
  }
  try {
    const trust = await rpc.$call('anonymous:devframe:auth', { authToken: options.authToken ?? '', ua: 'RStore explicit client', origin: '' })
    if (!trust?.isTrusted)
      throw new Error('Devtools relay authentication rejected')
    if (disconnected)
      throw new Error('Devtools relay disconnected during authentication')
    return { rpc, close }
  }
  catch (error) {
    close()
    throw error
  }
}
