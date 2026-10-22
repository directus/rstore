import * as v from 'valibot'
import { PROTOCOL_VERSION, TargetSchema } from './identity'

/** Public read RPC identifiers. */
export const READ_METHODS = [
  'rstore:list-sessions',
  'rstore:list-stores',
  'rstore:get-collections',
  'rstore:get-cache',
  'rstore:get-history',
  'rstore:get-subscriptions',
  'rstore:get-modules',
  'rstore:get-plugins',
] as const
/** Read method discriminant. */
export type ReadMethod = typeof READ_METHODS[number]
/** Strict bounded pagination; never clamp an invalid requested range. */
export const PageSchema = v.strictObject({
  offset: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)), 100),
})
/** Validated pagination. */
export type Page = v.InferOutput<typeof PageSchema>
/** Minimal exact-target read. */
export const TargetRequestSchema = v.strictObject({ target: TargetSchema })
/** Bounded cache filters, with effective or committed row selection. */
export const CacheRequestSchema = v.strictObject({
  target: TargetSchema,
  collection: v.pipe(v.string(), v.minLength(1)),
  layerId: v.optional(v.string()),
  view: v.optional(v.picklist(['effective', 'committed']), 'effective'),
  keySearch: v.optional(v.pipe(v.string(), v.maxLength(8192))),
  contentSearch: v.optional(v.pipe(v.string(), v.maxLength(8192))),
  page: v.optional(PageSchema, {}),
})
/** History cursor request; absent cursor means latest retained page. */
export const HistoryRequestSchema = v.pipe(v.strictObject({
  target: TargetSchema,
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(500)), 100),
  beforeSequence: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  afterSequence: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
}), v.check(input => input.beforeSequence === undefined || input.afterSequence === undefined, 'Use one exclusive history cursor'))
/** Store-list request retains explicit session ownership. */
export const StoresRequestSchema = v.strictObject({ sessionId: v.pipe(v.string(), v.minLength(1)) })
/** Producer handshake rejects incompatible protocol before publication. */
export const HandshakeSchema = v.strictObject({
  protocolVersion: v.literal(PROTOCOL_VERSION),
  sessionId: v.pipe(v.string(), v.minLength(1)),
})
/** Cache request after defaults have been applied. */
export type CacheRequest = v.InferOutput<typeof CacheRequestSchema>
/** History request after defaults have been applied. */
export type HistoryRequest = v.InferOutput<typeof HistoryRequestSchema>
/** Shared transport read envelope. */
export type ReadRequest
  = | { method: 'rstore:list-sessions' }
    | { method: 'rstore:list-stores', sessionId: string }
    | ({ method: 'rstore:get-cache' } & v.InferInput<typeof CacheRequestSchema>)
    | ({ method: 'rstore:get-history' } & v.InferInput<typeof HistoryRequestSchema>)
    | { method: Exclude<ReadMethod, 'rstore:list-sessions' | 'rstore:list-stores' | 'rstore:get-cache' | 'rstore:get-history'>, target: v.InferOutput<typeof TargetSchema> }
/** Read schemas keyed by exact public RPC identifier. */
export const ReadSchemas = {
  'rstore:list-sessions': v.strictObject({}),
  'rstore:list-stores': StoresRequestSchema,
  'rstore:get-collections': TargetRequestSchema,
  'rstore:get-cache': CacheRequestSchema,
  'rstore:get-history': HistoryRequestSchema,
  'rstore:get-subscriptions': TargetRequestSchema,
  'rstore:get-modules': TargetRequestSchema,
  'rstore:get-plugins': TargetRequestSchema,
} as const
