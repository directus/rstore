import type { Target } from './identity'
import type { ReadMethod } from './schemas'
import type { SessionSummary, StoreSummary } from './session'
import type { CachePage, CollectionSummary, HistoryPage, ModuleSummary, PluginSummary, ReadReply, SubscriptionSummary } from './views'
import * as v from 'valibot'
import { DevtoolsError } from './errors'
import { KeySchema, TargetSchema } from './identity'
import { isBoundedJson } from './json'
import { PreviewValueSchema } from './preview'
import { SessionSummarySchema, StoreSummarySchema } from './session'

/** Maximum encoded read response, including outer DTO envelope. */
export const MAX_READ_REPLY_BYTES = 512 * 1024
const count = v.pipe(v.number(), v.integer(), v.minValue(0))
const sequence = v.pipe(v.number(), v.integer(), v.minValue(1))
const timestamp = v.pipe(v.number(), v.finite())
const optionalPreview = v.optional(PreviewValueSchema)

/** Declared collection metadata without executable methods. */
export const CollectionSummarySchema = v.strictObject({
  name: v.string(),
  virtual: v.boolean(),
  relations: PreviewValueSchema,
  actions: v.array(v.string()),
  count: v.optional(count),
})
/** Projected cache row preserves public key type. */
export const CacheRowSchema = v.strictObject({ key: KeySchema, value: PreviewValueSchema })
/** Public layer description contains optional cache-owned write prevention. */
export const CacheLayerSummarySchema = v.strictObject({
  id: v.string(),
  collection: v.optional(v.string()),
  optimistic: v.boolean(),
  skip: v.boolean(),
  prevent: v.optional(v.strictObject({ update: v.optional(v.boolean()), delete: v.optional(v.boolean()) })),
  count: v.optional(count),
  deletedKeys: optionalPreview,
})
/** Valid cache page cannot claim matching total after incomplete scan. */
export const CachePageSchema = v.pipe(v.strictObject({
  rows: v.pipe(v.array(CacheRowSchema), v.maxLength(500)),
  total: count,
  matchingTotal: v.nullable(count),
  offset: count,
  limit: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)),
  scanTruncated: v.boolean(),
  layers: v.optional(v.pipe(v.array(CacheLayerSummarySchema), v.maxLength(1000))),
  metadata: optionalPreview,
}), v.check(page => page.rows.length <= page.limit && (!page.scanTruncated || page.matchingTotal === null), 'Invalid cache page bounds'))
/** History event contains detached diagnostic previews only. */
export const HistoryEntrySchema = v.strictObject({
  sequence,
  time: timestamp,
  operation: v.string(),
  phase: v.picklist(['start', 'complete', 'event', 'error']),
  operationId: v.optional(count),
  collection: v.optional(v.string()),
  key: v.optional(KeySchema),
  arguments: optionalPreview,
  result: optionalPreview,
  error: optionalPreview,
  truncated: v.optional(v.boolean()),
})
/** History entries retain strict increasing order below next sequence. */
export const HistoryPageSchema = v.pipe(v.strictObject({
  entries: v.pipe(v.array(HistoryEntrySchema), v.maxLength(500)),
  droppedCount: count,
  oldestSequence: v.optional(sequence),
  nextSequence: sequence,
  truncated: v.optional(v.boolean()),
}), v.check(page => page.entries.every((entry, index) =>
  entry.sequence < page.nextSequence && (index === 0 || page.entries[index - 1]!.sequence < entry.sequence)), 'Invalid history sequence order'))
/** Realtime subscription metadata does not contain live callbacks. */
export const SubscriptionSummarySchema = v.strictObject({
  id: v.string(),
  collection: v.string(),
  key: v.optional(KeySchema),
  findOptions: optionalPreview,
  startedAt: timestamp,
})
/** Public module values remain projected and non-executable. */
export const ModuleSummarySchema = v.strictObject({ name: v.string(), value: PreviewValueSchema })
/** Plugin descriptions do not expose setup or connector instances. */
export const PluginSummarySchema = v.strictObject({ name: v.string(), category: v.optional(v.string()), metadata: optionalPreview })

/** Bound traversal before Valibot reads any field or recurses into preview data. */
const BoundedReplySchema = v.custom<unknown>(input => isBoundedJson(input, {
  maxBytes: MAX_READ_REPLY_BYTES,
  maxDepth: 64,
  maxEntries: MAX_READ_REPLY_BYTES,
  omitUndefinedProperties: true,
}), 'Invalid or over-budget read reply')

/** Wrap view-specific DTO schema with common authority and availability metadata. */
function viewReply<S extends v.GenericSchema>(data: S) {
  return v.pipe(v.strictObject({
    target: TargetSchema,
    revision: count,
    data: v.nullable(data),
    truncated: v.boolean(),
    unavailable: v.optional(v.pipe(v.string(), v.minLength(1))),
  }), v.check(reply => reply.data !== null || reply.unavailable !== undefined, 'Null data requires explicit unavailability'))
}

/** Common reply shape for consumers inspecting envelope before selecting a view. */
export const ReadReplySchema = v.pipe(BoundedReplySchema, viewReply(v.unknown()))
/** Schemas selected by exact RPC identifier; every transport uses same definitions. */
export const ReadResultSchemas = {
  'rstore:list-sessions': v.pipe(BoundedReplySchema, v.array(SessionSummarySchema)),
  'rstore:list-stores': v.pipe(BoundedReplySchema, v.array(StoreSummarySchema)),
  'rstore:get-collections': v.pipe(BoundedReplySchema, viewReply(v.pipe(v.array(CollectionSummarySchema), v.maxLength(1000)))),
  'rstore:get-cache': v.pipe(BoundedReplySchema, viewReply(CachePageSchema)),
  'rstore:get-history': v.pipe(BoundedReplySchema, viewReply(HistoryPageSchema)),
  'rstore:get-subscriptions': v.pipe(BoundedReplySchema, viewReply(v.pipe(v.array(SubscriptionSummarySchema), v.maxLength(1000)))),
  'rstore:get-modules': v.pipe(BoundedReplySchema, viewReply(v.pipe(v.array(ModuleSummarySchema), v.maxLength(1000)))),
  'rstore:get-plugins': v.pipe(BoundedReplySchema, viewReply(v.pipe(v.array(PluginSummarySchema), v.maxLength(1000)))),
} as const

/** Typed read result selected by request method. */
export interface ReadResultMap {
  /** Connected and retained session summaries. */
  'rstore:list-sessions': SessionSummary[]
  /** Stores owned by selected session. */
  'rstore:list-stores': StoreSummary[]
  /** Collection descriptions or explicit unavailability. */
  'rstore:get-collections': ReadReply<CollectionSummary[] | null>
  /** Filtered cache page or explicit unavailability. */
  'rstore:get-cache': ReadReply<CachePage | null>
  /** Ordered retained events or explicit unavailability. */
  'rstore:get-history': ReadReply<HistoryPage | null>
  /** Observed realtime subscriptions or explicit unavailability. */
  'rstore:get-subscriptions': ReadReply<SubscriptionSummary[] | null>
  /** Projected module descriptions or explicit unavailability. */
  'rstore:get-modules': ReadReply<ModuleSummary[] | null>
  /** Safe plugin descriptions or explicit unavailability. */
  'rstore:get-plugins': ReadReply<PluginSummary[] | null>
}

/** Parse untrusted DTO and optionally fence exact requested store authority. */
export function validateReadResult<M extends ReadMethod>(method: M, input: unknown, expectedTarget?: Target): ReadResultMap[M] {
  if (!Object.hasOwn(ReadResultSchemas, method))
    throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Unknown read reply method' })
  const parsed = v.safeParse(ReadResultSchemas[method] as v.GenericSchema, input)
  if (!parsed.success)
    throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Invalid read reply' })
  const reply = parsed.output as ReadResultMap[M]
  if (expectedTarget && !Array.isArray(reply)
    && (reply.target.sessionId !== expectedTarget.sessionId || reply.target.storeId !== expectedTarget.storeId || reply.target.generation !== expectedTarget.generation)) {
    throw new DevtoolsError({ code: 'STALE_TARGET', message: 'Read reply target differs from requested target', target: expectedTarget })
  }
  return reply
}
