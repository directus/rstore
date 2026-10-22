import type { ProducerOutcome } from '../devframe/routing'
import type { ReadRequest } from '../protocol'
import type { RstoreDevtools } from '../runtime/types'
import type { RelayConnectionOptions } from './rpc'
import * as v from 'valibot'
import { executeAction } from '../actions'
import { WatchSchema } from '../devframe/watch'
import { DevtoolsError, PROTOCOL_VERSION } from '../protocol'
import { openRelayRpc } from './rpc'

/** Terminal configuration errors are distinct from retryable transport loss. */
function terminalConnectionFailure(error: unknown): boolean {
  if (!(error instanceof Error))
    return false
  if (error.message === 'Devtools relay authentication rejected')
    return true
  const failure = error as Error & { code?: string, details?: { code?: string } }
  const code = failure.details?.code ?? failure.code ?? failure.name
  return ['READ_ONLY', 'PROTOCOL_MISMATCH', 'COMMAND_CONFLICT', 'INVALID_ARGUMENTS', 'CAPACITY', 'DF0036', 'DF0043'].includes(code)
}

/** One socket can own many SSR requests; ordinary producer owns one runtime. */
export interface ProducerConnection {
  /** Resolves after initial authentication and current registration publication. */
  ready: Promise<void>
  /** Add caller-owned runtime to this authenticated producer connection. */
  attach: (runtime: RstoreDevtools) => () => void
  /** Call private worker publication APIs without duplicating transport. */
  call: (method: string, ...args: unknown[]) => Promise<unknown>
  /** Observe authenticated availability; supports bounded worker snapshot buffering. */
  onConnection: (listener: (connected: boolean) => void) => () => void
  /** Cancel backoff and close channel; caller retains runtime ownership. */
  dispose: () => void
}
/** Connect and reconnect state publication; data commands are never replayed. */
export function connectProducer(initial: RstoreDevtools | undefined, options: RelayConnectionOptions): ProducerConnection {
  const runtimes = new Map<string, RstoreDevtools>()
  const subscriptions = new Map<string, () => void>()
  const connectionListeners = new Set<(connected: boolean) => void>()
  const watches = new Map<string, { sessionId: string, stop: () => void }>()
  let authenticated = false
  let live: Awaited<ReturnType<typeof openRelayRpc>> | undefined
  let disposed = false
  let terminal = false
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let resolveReady: () => void
  let rejectReady: (error: unknown) => void
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  // Optional relays must never cause an unhandled rejection in application bootstrap.
  void ready.catch(() => {})
  /** Notify availability after complete authentication/publication; observer faults isolate. */
  function publishConnection(connected: boolean) {
    authenticated = connected
    for (const listener of connectionListeners) {
      try {
        listener(connected)
      }
      catch { /* Consumer notification cannot change transport lifetime. */ }
    }
  }
  /** Detached selector publication contains no stores, tokens or callable objects. */
  function publication(runtime: RstoreDevtools) {
    return { handshake: { protocolVersion: PROTOCOL_VERSION, sessionId: runtime.session.sessionId }, session: runtime.session }
  }
  /** Private registration uses JSON error envelope so retry classification survives wire. */
  async function register(runtime: RstoreDevtools, connection: Awaited<ReturnType<typeof openRelayRpc>>) {
    const result = await connection.rpc.$call('rstore:producer-register', publication(runtime))
    if (!result?.ok)
      throw new DevtoolsError(result?.error ?? { code: 'PROTOCOL_MISMATCH', message: 'Invalid producer registration response' })
  }
  /** Validate and dispatch on actual owning runtime, keeping wire errors JSON-safe. */
  async function dispatch(envelope: { kind: 'read' | 'action', request: any }): Promise<ProducerOutcome> {
    try {
      const sessionId = envelope.request?.target?.sessionId ?? envelope.request?.sessionId
      const runtime = runtimes.get(sessionId)
      if (!runtime)
        throw new DevtoolsError({ code: 'TARGET_NOT_FOUND', message: 'Producer runtime unavailable' })
      const value = envelope.kind === 'action' ? await executeAction(runtime, envelope.request) : runtime.read(envelope.request as ReadRequest)
      return { ok: true, value }
    }
    catch (error) {
      return { ok: false, error: error instanceof DevtoolsError ? error.details : { code: 'INVALID_ARGUMENTS', message: 'Invalid producer request' } }
    }
  }
  /** Schedule bounded reconnect only for transport/discovery failures. */
  function reconnect() {
    if (disposed || terminal || timer)
      return
    live = undefined
    for (const watch of watches.values()) watch.stop()
    watches.clear()
    publishConnection(false)
    timer = setTimeout(() => {
      timer = undefined
      void connect()
    }, Math.min(30_000, 250 * 2 ** Math.min(attempt++, 7)))
  }
  /** Establish fresh owner connection; late connects close instead of reclaiming. */
  async function connect() {
    let candidate: Awaited<ReturnType<typeof openRelayRpc>> | undefined
    try {
      candidate = await openRelayRpc(options, {
        'rstore:producer-dispatch': dispatch,
        'rstore:producer-watch': function (input: unknown) {
          const { watchId, ...request } = v.parse(v.strictObject({ watchId: v.string(), ...WatchSchema.entries }), input)
          const runtime = runtimes.get(request.target.sessionId)
          if (!runtime)
            throw new DevtoolsError({ code: 'TARGET_NOT_FOUND', message: 'Producer runtime unavailable' })
          watches.get(watchId)?.stop()
          watches.set(watchId, { sessionId: request.target.sessionId, stop: runtime.subscribe(() => {}, request.target, request.view) })
        },
        'rstore:producer-unwatch': function (input: unknown) {
          const { watchId } = v.parse(v.strictObject({ watchId: v.string() }), input)
          watches.get(watchId)?.stop()
          watches.delete(watchId)
        },
      }, reconnect)
      if (disposed) {
        candidate.close()
        return
      }
      live = candidate
      for (const runtime of runtimes.values())
        await register(runtime, candidate)
      attempt = 0
      publishConnection(true)
      resolveReady!()
    }
    catch (error) {
      candidate?.close()
      live = undefined
      publishConnection(false)
      // Authentication/protocol/identity rejection needs changed configuration.
      if (terminalConnectionFailure(error)) {
        terminal = true
        if (timer)
          clearTimeout(timer)
        timer = undefined
        rejectReady!(error)
      }
      else {
        reconnect()
      }
    }
  }
  /** Subscribe only while attached; disposal does not transfer application ownership. */
  function attach(runtime: RstoreDevtools) {
    const id = runtime.session.sessionId
    if (disposed || runtimes.has(id))
      throw new TypeError('Producer runtime already attached or connection disposed')
    runtimes.set(id, runtime)
    subscriptions.set(id, runtime.subscribe((event) => {
      void live?.rpc.$call('rstore:producer-publish', publication(runtime), event).catch(() => {})
    }))
    if (live)
      void register(runtime, live).catch(() => {})
    let detached = false
    return () => {
      if (detached)
        return
      detached = true
      subscriptions.get(id)?.()
      subscriptions.delete(id)
      for (const [watchId, watch] of watches) {
        if (watch.sessionId === id) {
          watches.delete(watchId)
          watch.stop()
        }
      }
      runtimes.delete(id)
      void live?.rpc.$call('rstore:producer-unregister', id).catch(() => {})
    }
  }
  if (initial)
    attach(initial)
  void connect()
  return {
    ready,
    attach,
    onConnection(listener) {
      connectionListeners.add(listener)
      listener(authenticated)
      return () => {
        connectionListeners.delete(listener)
      }
    },
    async call(method, ...args) {
      await ready
      if (!live || disposed)
        throw new DevtoolsError({ code: 'UNAVAILABLE', message: 'Producer relay disconnected' })
      return live.rpc.$call(method, ...args)
    },
    dispose() {
      if (disposed)
        return
      disposed = true
      if (timer)
        clearTimeout(timer)
      timer = undefined
      for (const unsubscribe of subscriptions.values()) unsubscribe()
      for (const watch of watches.values()) watch.stop()
      watches.clear()
      subscriptions.clear()
      runtimes.clear()
      live?.close()
      live = undefined
      publishConnection(false)
      connectionListeners.clear()
      rejectReady!(new DevtoolsError({ code: 'UNAVAILABLE', message: 'Producer connection disposed' }))
    },
  }
}
