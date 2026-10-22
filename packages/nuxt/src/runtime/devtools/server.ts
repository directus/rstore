import type { H3Event } from '@nuxt/nitro-server/h3'
import type { SSRWorker } from '@rstore/devtools/node'
import type { NuxtApp } from 'nuxt/app'
import type { SSRRequestHandle } from './request'
import { createSSRWorker } from '@rstore/devtools/node'
import { createSSRRequest } from './request'

/** Private configuration is never placed in public runtime config or Nuxt payload. */
export interface SSRDevtoolsConfig {
  /** Actual listening relay loopback origin including hosted base. */
  baseURL: string
  /** Dedicated authenticated server-producer credential. */
  authToken: string
}
/** Process-owned state shared across Nitro and SSR renderer bundles. */
interface SSRProcessState {
  /** One socket and detached capture buffer per worker. */
  worker: SSRWorker
  /** At most 50 active events; terminal release deletes every strong reference. */
  requests: Map<H3Event, { handle: SSRRequestHandle, cleanup: () => void }>
  /** Prevent error rendering on same event from creating another request identity. */
  finalized: WeakSet<object>
}
const stateKey = Symbol.for('@rstore/nuxt/devtools/ssr-worker')
/** Retrieve process state without leaking credentials into request state. */
function state(): SSRProcessState | undefined {
  return (globalThis as Record<symbol, unknown>)[stateKey] as SSRProcessState | undefined
}

/** Runtime configuration is unknown until both private connection fields validate. */
function readConfig(value: unknown): SSRDevtoolsConfig | undefined {
  if (!value || typeof value !== 'object')
    return undefined
  if ('baseURL' in value && typeof value.baseURL === 'string' && value.baseURL
    && 'authToken' in value && typeof value.authToken === 'string' && value.authToken) {
    return { baseURL: value.baseURL, authToken: value.authToken }
  }
}

/** Bootstrap request instrumentation synchronously before actual store creation. */
export function beginRstoreSSR(nuxtApp: NuxtApp, privateConfig?: unknown): SSRRequestHandle | undefined {
  const context = nuxtApp.ssrContext
  const config = readConfig(privateConfig)
  if (!context?.event || !config)
    return undefined
  const event = context.event
  let owner = state()
  if (!owner) {
    owner = { worker: createSSRWorker(config), requests: new Map(), finalized: new WeakSet() }
    ;(globalThis as Record<symbol, unknown>)[stateKey] = owner
  }
  if (owner.finalized.has(event))
    return undefined
  const existing = owner.requests.get(event)
  if (existing)
    return existing.handle
  const handle = createSSRRequest(owner.worker, event.path, event.method)
  if (!handle)
    return undefined
  const stopRendered = nuxtApp.hook('app:rendered', handle.capture)
  const stopError = nuxtApp.hook('app:error', error => finalizeRstoreSSR(event, 'error', error))
  const response = event.node.res
  /** A closed unfinished response is the abort fallback absent afterResponse. */
  function close() {
    finalizeRstoreSSR(event, response.writableFinished ? 'completed' : 'aborted')
  }
  response.once('close', close)
  owner.requests.set(event, {
    handle,
    cleanup() {
      stopRendered()
      stopError()
      response.removeListener('close', close)
    },
  })
  return handle
}

/** Terminal callbacks from Nuxt/Nitro/response-close converge once on same event. */
export function finalizeRstoreSSR(event: H3Event, status: 'completed' | 'error' | 'aborted', error?: unknown) {
  const owner = state()
  const request = owner?.requests.get(event)
  if (!request)
    return
  owner!.requests.delete(event)
  owner!.finalized.add(event)
  request.cleanup()
  request.handle.finalize(status, error)
}

/** Nitro worker shutdown closes process-owned socket, timers and capture buffer. */
export function disposeRstoreSSR() {
  const owner = state()
  for (const event of owner?.requests.keys() ?? [])
    finalizeRstoreSSR(event, 'aborted')
  owner?.worker.dispose()
  delete (globalThis as Record<symbol, unknown>)[stateKey]
}

/** Detached diagnostics used by development integration fixtures, never credentials. */
export function getRstoreSSRDiagnostics() {
  const worker = state()?.worker
  return { workerStarted: !!worker, activeCount: worker?.activeCount ?? 0, droppedCount: worker?.droppedCount ?? 0, snapshots: worker?.snapshots ?? [] }
}
