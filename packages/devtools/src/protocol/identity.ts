import * as v from 'valibot'

/** Wire protocol version; peers must agree before publishing targets. */
export const PROTOCOL_VERSION = 1 as const
/** String or finite numeric public collection key, preserving zero/empty string. */
export const KeySchema = v.union([v.string(), v.pipe(v.number(), v.finite())])
/** Complete authority identity; generations cannot be reused after disposal. */
export const TargetSchema = v.strictObject({
  sessionId: v.pipe(v.string(), v.minLength(1)),
  storeId: v.pipe(v.string(), v.minLength(1)),
  generation: v.pipe(v.number(), v.integer(), v.minValue(1)),
})
/** Public target identity. */
export type Target = v.InferOutput<typeof TargetSchema>
/** Public collection key. */
export type ItemKey = v.InferOutput<typeof KeySchema>
/** Target type alias for consumers naming store authority explicitly. */
export type StoreTarget = Target
