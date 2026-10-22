import type { CacheInspection, Plugin, StoreCore, StoreSchema } from '@rstore/shared'
import type { History } from '../instrumentation/history'
import type { Action, ActionResult, Capabilities, ReadReply, ReadRequest, SessionKind, SessionRequest, SessionSummary, StoreSummary, Target } from '../protocol'

/** A Core-compatible store. Runtime imports no Vue, Nuxt, or host implementation. */
export type InspectableStore = StoreCore<StoreSchema, any>
/** Sections invalidate independently; consumers fetch only their selected view. */
export type InspectionView = 'collections' | 'cache' | 'history' | 'subscriptions' | 'modules' | 'plugins'
/** Optional framework integration around neutral store ownership. */
export interface DevtoolsAdapter {
  /** Unwrap values before bounded projection. */
  unwrap?: (value: unknown) => unknown
  /** Override public cache inspection for a custom cache. */
  readCache?: (store: InspectableStore) => CacheInspection | undefined
  /** Observe module/layer values while a consumer subscribes. */
  observe?: (store: InspectableStore, onChange: (view?: InspectionView) => void) => () => void
}
/** Registration authority belongs to this runtime until disposed. */
export interface RegistrationOptions {
  /** Unique live logical ID; reuse requires disposal and a new generation. */
  id: string
  /** Human-readable selector label. */
  label?: string
  /** Optional framework-specific observation and unwrapping. */
  adapter?: DevtoolsAdapter
  /** Reject every action; SSR forces this regardless of caller options. */
  readOnly?: boolean
}
/** Neutral runtime configuration. */
export interface RuntimeOptions {
  /** Explicit identity for trusted bootstrap/testing; random by default. */
  sessionId?: string
  /** Producer category; SSR registrations are always read-only. */
  kind?: SessionKind
  /** Bounded active SSR request details; ignored for ordinary producers. */
  request?: SessionRequest
  /** Session selector label. */
  label?: string
  /** Maximum history entry count, default 1,000. */
  historyLimit?: number
  /** Maximum encoded history bytes, default 4 MiB. */
  historyBytes?: number
}
/** Detached notification; never includes a live store or unsolicited data. */
export interface RuntimeInvalidation {
  /** A registry change has no target. */
  target?: Target
  /** Changed view, or registration lifecycle. */
  view: InspectionView | 'registry'
  /** Current monotonically increasing view revision. */
  revision: number
}
/** Live registration internals shared only with owned action/read handlers. */
export interface StoreRegistration {
  /** Complete store authority, frozen at registration. */
  readonly target: Target
  /** Current label. */
  readonly label: string
  /** Live store reference, released on dispose. */
  readonly store: InspectableStore
  /** Optional projection/observation adapter. */
  readonly adapter?: DevtoolsAdapter
  /** Explicit capabilities. */
  readonly capabilities: Capabilities
  /** SSR/explicit write prohibition. */
  readonly readOnly: boolean
  /** Detached bounded operation evidence. */
  readonly history: History
  /** Independent read revisions. */
  readonly revisions: Record<InspectionView, number>
  /** Subscription descriptions discovered through actual hooks. */
  readonly subscriptions: Map<string, unknown>
  /** Mark a view changed without coalescing captured operations. */
  invalidate: (view: InspectionView) => void
  /** Stop observation, remove authority, and release references. */
  dispose: () => void
  /** Begin scoped module observation, release on final subscriber. */
  observe: () => () => void
}
/** Public portable runtime and internal exact-target resolution. */
export interface RstoreDevtools {
  /** Fresh producer identity; returned summary is detached. */
  readonly session: SessionSummary
  /** Register already-created Core/Vue store. */
  attachStore: (store: InspectableStore, options: RegistrationOptions) => StoreRegistration
  /** Register store during its synchronous plugin setup and init hook. */
  plugin: (options: RegistrationOptions) => Plugin
  /** Return current store selector summaries. */
  listStores: () => StoreSummary[]
  /** Resolve exact generation, never another live replacement. */
  resolve: (target: Target) => StoreRegistration
  /** Shared validated bounded read handler. */
  read: {
    /** Session discovery has no store authority. */
    (request: Extract<ReadRequest, { method: 'rstore:list-sessions' }>): SessionSummary[]
    /** Store discovery owns an explicit session. */
    (request: Extract<ReadRequest, { method: 'rstore:list-stores' }>): StoreSummary[]
    /** Store views carry exact identity and revision. */
    (request: Exclude<ReadRequest, { method: 'rstore:list-sessions' | 'rstore:list-stores' }>): ReadReply<any>
    /** Transport requests may dispatch any validated method. */
    (request: ReadRequest): ReadReply<any> | SessionSummary[] | StoreSummary[]
  }
  /** Shared validated explicit data action path. */
  execute: (action: Action) => Promise<ActionResult>
  /** Subscribe to detached invalidations; optional view starts observation. */
  subscribe: (listener: (event: RuntimeInvalidation) => void, target?: Target, view?: InspectionView) => () => void
  /** Release all stores, hooks, subscribers and timers; safe to repeat. */
  dispose: () => void
}
