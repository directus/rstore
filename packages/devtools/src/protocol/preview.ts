import * as v from 'valibot'

/** Detached JSON diagnostic value; application composites always receive their own wrapper. */
export type PreviewValue = null | boolean | number | string
  | { kind: 'object', entries: [string, PreviewValue][], truncated?: true }
  | { kind: 'array' | 'set', values: PreviewValue[], truncated?: true }
  | { kind: 'map', entries: [PreviewValue, PreviewValue][], truncated?: true }
  | { kind: 'date', value: string | null }
  | { kind: 'bigint' | 'function', value: string }
  | { kind: 'error', name: string, message: string, entries: [string, PreviewValue][], truncated?: true }
  | { kind: 'reference', path: string }
  | { kind: 'accessor' | 'unsupported' | 'truncated', reason: string, path: string }

/** Result records exact encoded preview bytes and any omitted information. */
export interface ProjectionResult {
  /** Detached JSON preview. */
  value: PreviewValue
  /** UTF-8 byte size of JSON.stringify(value). */
  bytes: number
  /** At least one source value, entry or string was omitted. */
  truncated: boolean
}

/** Recursive schema shared by all transport and runtime consumers. */
export const PreviewValueSchema: v.GenericSchema<PreviewValue> = v.lazy(() => v.union([
  v.null(),
  v.boolean(),
  v.pipe(v.number(), v.finite()),
  v.string(),
  v.object({ kind: v.literal('object'), entries: v.array(v.tuple([v.string(), PreviewValueSchema])), truncated: v.optional(v.literal(true)) }),
  v.object({ kind: v.picklist(['array', 'set']), values: v.array(PreviewValueSchema), truncated: v.optional(v.literal(true)) }),
  v.object({ kind: v.literal('map'), entries: v.array(v.tuple([PreviewValueSchema, PreviewValueSchema])), truncated: v.optional(v.literal(true)) }),
  v.object({ kind: v.literal('date'), value: v.nullable(v.string()) }),
  v.object({ kind: v.picklist(['bigint', 'function']), value: v.string() }),
  v.object({ kind: v.literal('error'), name: v.string(), message: v.string(), entries: v.array(v.tuple([v.string(), PreviewValueSchema])), truncated: v.optional(v.literal(true)) }),
  v.object({ kind: v.literal('reference'), path: v.string() }),
  v.object({ kind: v.picklist(['accessor', 'unsupported', 'truncated']), reason: v.string(), path: v.string() }),
]))

/** Wire result schema excludes negative or fractional byte accounting. */
export const ProjectionResultSchema = v.object({
  value: PreviewValueSchema,
  bytes: v.pipe(v.number(), v.integer(), v.minValue(0)),
  truncated: v.boolean(),
})
