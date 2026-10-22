import type { DevframeNodeRpcSession } from 'devframe'
import type { SessionSummary } from '../protocol'
import { DevtoolsError } from '../protocol'

/** Captured authenticated owner; replacing it fences every outstanding call. */
export interface ProducerOwner {
  /** RPC session handle never retained after disconnect. */
  session: DevframeNodeRpcSession
  /** Increasing connection authority, distinct from store generation. */
  epoch: number
}
/** Metadata persists briefly; only connected records retain RPC authority. */
export interface ProducerRecord {
  /** Bounded detached selector metadata. */
  summary: SessionSummary
  /** Exact live owner, absent while disconnected. */
  owner?: ProducerOwner
  /** Disconnected metadata expiration time. */
  expiresAt?: number
  /** Detached completed SSR reader; never closes over live request/store. */
  read?: (request: import('../protocol').ReadRequest) => unknown
}

/** Devframe creates a fresh wrapper per call; stable meta and RPC identify peer. */
export function sameRpcPeer(first: DevframeNodeRpcSession, second?: DevframeNodeRpcSession): boolean {
  return first.meta === second?.meta && first.rpc === second.rpc
}

/** Isolated producer registry with explicit connection ownership. */
export function createProducerRegistry(reservedSessionId?: string) {
  const records = new Map<string, ProducerRecord>()
  let epoch = 0
  /** Remove expired disconnected metadata without a permanent timer. */
  function prune() {
    for (const [id, record] of records) {
      if (record.expiresAt !== undefined && record.expiresAt <= Date.now())
        records.delete(id)
    }
    // Bound disconnected metadata even under rapid producer restarts.
    const disconnected = [...records].filter(([, record]) => !record.owner)
    for (const [id] of disconnected.slice(0, Math.max(0, disconnected.length - 50)))
      records.delete(id)
  }
  return {
    /** Atomically claim fresh/reconnected identity, refusing simultaneous owners. */
    register(summary: SessionSummary, session: DevframeNodeRpcSession): ProducerOwner {
      prune()
      const prior = records.get(summary.sessionId)
      if (summary.sessionId === reservedSessionId || prior?.read || prior?.summary.completed)
        throw new DevtoolsError({ code: 'COMMAND_CONFLICT', message: 'Producer identity reserved or completed' })
      if (prior && prior.summary.kind !== summary.kind)
        throw new DevtoolsError({ code: 'PROTOCOL_MISMATCH', message: 'Producer role cannot replace existing session kind' })
      if (prior?.owner && !sameRpcPeer(prior.owner.session, session))
        throw new DevtoolsError({ code: 'COMMAND_CONFLICT', message: 'Producer identity already connected' })
      const owner = prior?.owner ?? { session, epoch: ++epoch }
      records.set(summary.sessionId, { summary, owner })
      return owner
    },
    /** Replace only metadata belonging to current owner. */
    publish(summary: SessionSummary, session: DevframeNodeRpcSession) {
      const record = records.get(summary.sessionId)
      if (!record?.owner || !sameRpcPeer(record.owner.session, session))
        throw new DevtoolsError({ code: 'STALE_TARGET', message: 'Producer connection no longer owns session' })
      record.summary = summary
    },
    /** Retain a bounded immutable SSR snapshot behind its detached reader. */
    retain(summary: SessionSummary, read: (request: import('../protocol').ReadRequest) => unknown) {
      const prior = records.get(summary.sessionId)
      if (summary.sessionId === reservedSessionId || (prior && prior.summary.kind !== summary.kind))
        throw new DevtoolsError({ code: 'COMMAND_CONFLICT', message: 'Recorded identity cannot replace another producer kind' })
      const record = { summary, read, expiresAt: (summary.completedAt ?? Date.now()) + 300_000 }
      records.set(summary.sessionId, record)
      prune()
      return () => {
        if (records.get(summary.sessionId) === record)
          records.delete(summary.sessionId)
      }
    },
    /** Remove bounded captured metadata after ledger eviction. */
    remove(sessionId: string) { records.delete(sessionId) },
    /** Fetch detached selectors without exposing handles or credential-bearing meta. */
    list(): SessionSummary[] {
      prune()
      return [...records.values()].map(record => ({ ...record.summary, stores: record.summary.stores.map(store => ({ ...store, target: { ...store.target }, capabilities: { ...store.capabilities } })) }))
    },
    /** Resolve exact connected session for routing. */
    get(sessionId: string): ProducerRecord {
      prune()
      const record = records.get(sessionId)
      if (!record)
        throw new DevtoolsError({ code: 'TARGET_NOT_FOUND', message: 'Producer session unavailable' })
      if (!record.owner && !record.read)
        throw new DevtoolsError({ code: 'UNAVAILABLE', message: 'Producer disconnected' })
      return record
    },
    /** Reject late results from superseded RPC authority. */
    isCurrent(sessionId: string, owner: ProducerOwner): boolean {
      return records.get(sessionId)?.owner === owner
    },
    /** Disconnect matches session object/id, never an arbitrary producer label. */
    disconnect(connectionId: number) {
      for (const record of records.values()) {
        if (record.owner?.session.meta.id === connectionId) {
          record.owner = undefined
          record.summary = { ...record.summary, connected: false }
          record.expiresAt = Date.now() + 300_000
        }
      }
      prune()
    },
    /** Detach a single request/runtime sharing the authenticated worker socket. */
    detach(sessionId: string, session: DevframeNodeRpcSession) {
      const record = records.get(sessionId)
      if (record?.owner && sameRpcPeer(record.owner.session, session)) {
        record.owner = undefined
        record.summary = { ...record.summary, connected: false }
        record.expiresAt = Date.now() + 300_000
      }
    },
    /** Clear metadata and all RPC handles when server closes. */
    dispose() { records.clear() },
  }
}
/** Registry used only behind authoritative definition handlers. */
export type ProducerRegistry = ReturnType<typeof createProducerRegistry>
