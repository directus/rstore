import type { ReadReply, SessionRequest, SessionSummary, Target, ViewName } from '../protocol'

/** Terminal request state; captured records never regain write authority. */
export type SSRStatus = 'completed' | 'error' | 'aborted'
/** Explicit safe request metadata, excluding query, headers and payload. */
export interface SSRRequestMetadata extends SessionRequest {
  /** Terminal epoch milliseconds. */
  completedAt: number
  /** Terminal state. */
  status: SSRStatus
  /** Elapsed milliseconds. */
  duration: number
}
/** Detached sections owned by one exact store generation. */
export interface SSRStoreSnapshot {
  /** Exact authority captured; generation remains fenced on later reads. */
  target: Target
  /** Captured sections; cache is indexed by public collection name. */
  views: Partial<Record<Exclude<ViewName, 'cache'>, ReadReply>> & { cache?: Record<string, ReadReply> }
}
/** Immutable transport record containing DTOs only, never stores or callbacks. */
export interface SSRSnapshot extends SSRStoreSnapshot {
  /** Completed request session. */
  session: SessionSummary
  /** Safe terminal metadata. */
  request: SSRRequestMetadata
  /** Remaining advertised stores; primary target/views retain legacy wire shape. */
  additionalStores?: SSRStoreSnapshot[]
  /** True when any section could not fit the shared capture allowance. */
  truncated: boolean
}
/** Bounded detached record repository. */
export interface SSRRetention {
  /** Encoded retained bytes. */
  readonly bytes: number
  /** Accept bounded completed capture and evict oldest when needed. */
  add: (snapshot: SSRSnapshot) => void
  /** Read detached record by session ID. */
  get: (sessionId: string) => SSRSnapshot | undefined
  /** Read newest records first. */
  list: () => SSRSnapshot[]
  /** Retained identities without materializing capture data. */
  ids: () => string[]
  /** Expire elapsed records; caller owns any housekeeping timer. */
  prune: () => void
  /** Release all records and reject new publications. */
  dispose: () => void
}
