import type { RstoreDevtools } from '../runtime/types'
import type { SSRSnapshot } from '../ssr/types'
import type { RelayConnectionOptions } from './rpc'
import { createSSRRetention } from '../ssr/retention'
import { connectProducer } from './producer'

/** Process-owned worker: one connection, bounded live admission and detached buffer. */
export function createSSRWorker(options: RelayConnectionOptions) {
  const connection = connectProducer(undefined, options)
  const retained = createSSRRetention()
  const active = new Map<string, () => void>()
  let connected = false
  let disposed = false
  let dropped = 0
  const pending = new Set<string>()
  let publishing = false
  /** One in-flight detached DTO; unavailable relay never accumulates await closures. */
  function publish() {
    if (!connected || disposed || publishing)
      return
    const id = pending.values().next().value
    if (!id)
      return
    pending.delete(id)
    const snapshot = retained.get(id)
    if (!snapshot) {
      publish()
      return
    }
    publishing = true
    void connection.call('rstore:producer-ssr-snapshot', snapshot).catch(() => {}).finally(() => {
      publishing = false
      publish()
    })
  }
  const stopConnection = connection.onConnection((value) => {
    connected = value
    if (connected) {
      for (const id of retained.ids())
        pending.add(id)
      publish()
    }
  })
  return {
    /** Number of currently inspectable requests, capped at 50. */
    get activeCount() { return active.size },
    /** Requests exceeding admission; never affects application response. */
    get droppedCount() { return dropped },
    /** Detached local captures remain available while relay is unavailable. */
    get snapshots() { return retained.list() },
    /** Attach request runtime only while it remains active. */
    attach(runtime: RstoreDevtools): (() => void) | undefined {
      if (disposed || active.size >= 50) {
        dropped = Math.min(Number.MAX_SAFE_INTEGER, dropped + 1)
        return undefined
      }
      const id = runtime.session.sessionId
      const detach = connection.attach(runtime)
      active.set(id, detach)
      return () => {
        if (active.get(id) !== detach)
          return
        active.delete(id)
        detach()
      }
    },
    /** Buffer detached completed snapshot; no promise retains requests on outage. */
    complete(snapshot: SSRSnapshot) {
      if (disposed)
        return
      retained.add(snapshot)
      const ids = new Set(retained.ids())
      for (const id of pending) {
        if (!ids.has(id))
          pending.delete(id)
      }
      pending.add(snapshot.session.sessionId)
      publish()
    },
    /** Stop process-owned transport and release both active leases and detached records. */
    dispose() {
      if (disposed)
        return
      disposed = true
      stopConnection()
      for (const detach of active.values())
        detach()
      active.clear()
      pending.clear()
      connection.dispose()
      retained.dispose()
    },
  }
}
/** Request lifecycle collaborators use process-owned worker without new sockets. */
export type SSRWorker = ReturnType<typeof createSSRWorker>
