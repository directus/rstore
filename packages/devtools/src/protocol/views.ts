import type { ItemKey, Target } from './identity'
import type { PreviewValue } from './preview'

/** Individual view invalidation revision counters. */
export type ViewName = 'collections' | 'cache' | 'history' | 'subscriptions' | 'modules' | 'plugins'
/** Detached read response tied to exact target and observed revision. */
export interface ReadReply<T = unknown> {
  /** Target that authorized traversal. */
  target: Target
  /** Relevant view revision at capture. */
  revision: number
  /** Projected, bounded view data. */
  data: T
  /** True when projection or reply budget omitted data. */
  truncated: boolean
  /** Explicit reason when public inspection is unavailable. */
  unavailable?: string
}
/** Declared collection description, without runtime methods. */
export interface CollectionSummary {
  /** Public collection name. */
  name: string
  /** Whether collection is virtual. */
  virtual: boolean
  /** Declared relation descriptions. */
  relations: PreviewValue
  /** Public supported action names. */
  actions: string[]
  /** Exact cache metadata count if available. */
  count?: number
}
/** Projected cache row retaining original numeric/string key type. */
export interface CacheRow {
  /** Public cache address. */
  key: ItemKey
  /** Detached preview of source row. */
  value: PreviewValue
}
/** Non-executable public cache layer description. */
export interface CacheLayerSummary {
  /** Cache-owned layer identifier. */
  id: string
  /** Collection owning layer, where provided. */
  collection?: string
  /** Optimistic layer status. */
  optimistic: boolean
  /** Whether cache skips this layer during reads. */
  skip: boolean
  /** Layer write prevention metadata. */
  prevent?: { update?: boolean, delete?: boolean }
  /** Cache-owned row count when known. */
  count?: number
  /** Projected deletion-key description. */
  deletedKeys?: PreviewValue
}
/** Filtered cache page; incomplete scan cannot claim a matching total. */
export interface CachePage {
  /** Bounded projected page rows. */
  rows: CacheRow[]
  /** Exact metadata count, independent of filters. */
  total: number
  /** Full matching count or null when bounded scan is incomplete. */
  matchingTotal: number | null
  /** Requested page start. */
  offset: number
  /** Requested maximum page size. */
  limit: number
  /** True when more candidate rows exist than allowed scan budget. */
  scanTruncated: boolean
  /** Bounded cache-owned layer descriptions. */
  layers?: CacheLayerSummary[]
  /** Bounded projected public cache metadata, including queue/pause diagnostics. */
  metadata?: PreviewValue
}
/** Detached event recorded at observation, rather than live object access. */
export interface HistoryEntry {
  /** Monotonically increasing sequence, never reset on clear. */
  sequence: number
  /** Event epoch milliseconds. */
  time: number
  /** Public hook operation description. */
  operation: string
  /** Correlated operation phase. */
  phase: 'start' | 'complete' | 'event' | 'error'
  /** Local correlation identity when hook supports pairing. */
  operationId?: number
  /** Public collection name if supplied by hook. */
  collection?: string
  /** Public item address if supplied by hook. */
  key?: ItemKey
  /** Detached projected hook arguments. */
  arguments?: PreviewValue
  /** Detached projected outcome. */
  result?: PreviewValue
  /** Detached projected failure. */
  error?: PreviewValue
  /** Event preview omitted source information because projection budget was reached. */
  truncated?: boolean
}
/** Retained history page returned oldest to newest. */
export interface HistoryPage {
  /** Ordered selected entries. */
  entries: HistoryEntry[]
  /** Entries removed because count/byte budgets were reached. */
  droppedCount: number
  /** Earliest retained sequence when nonempty. */
  oldestSequence?: number
  /** Next sequence to assign, including after clear. */
  nextSequence: number
  /** Page byte budget omitted otherwise selected entries. */
  truncated?: boolean
}
/** Realtime subscription reported from actual instrumentation hooks. */
export interface SubscriptionSummary {
  /** Hook-provided subscription ID. */
  id: string
  /** Public collection name. */
  collection: string
  /** Public item key where subscription is item-specific. */
  key?: ItemKey
  /** Projected detached subscription arguments. */
  findOptions?: PreviewValue
  /** Registration epoch milliseconds. */
  startedAt: number
}
/** Projected public module description; never callable remotely. */
export interface ModuleSummary {
  /** Public module name. */
  name: string
  /** Detached preview of exposed values. */
  value: PreviewValue
}
/** Public plugin metadata without connector or setup closures. */
export interface PluginSummary {
  /** Public plugin name. */
  name: string
  /** Category declared by plugin. */
  category?: string
  /** Detached description of additional safe metadata. */
  metadata?: PreviewValue
}
/** Revision notification requests fresh bounded data rather than publishing stores. */
export interface Invalidation {
  /** Exact affected store identity. */
  target: Target
  /** Changed view. */
  view: ViewName
  /** New authoritative view revision. */
  revision: number
}
