import type { JsonValue } from './json'
import * as v from 'valibot'
import { KeySchema, TargetSchema } from './identity'
import { isActionJson } from './json'
import { PreviewValueSchema } from './preview'

/** Supported exact-target diagnostic and data actions. */
export const ACTION_NAMES = [
  'clear-history',
  'write-cache-item',
  'delete-cache-item',
  'clear-cache',
  'create-item',
  'update-item',
  'delete-item',
] as const
/** Action discriminant. */
export type ActionName = typeof ACTION_NAMES[number]
/** Public action RPC identifiers. */
export const ACTION_METHODS = ACTION_NAMES.map(name => `rstore:${name}` as const)
const envelope = {
  target: TargetSchema,
  commandId: v.pipe(v.string(), v.minLength(1)),
  issuedAt: v.pipe(v.number(), v.finite()),
}
const collection = v.pipe(v.string(), v.minLength(1))
const item = v.custom<JsonValue>(isActionJson, 'Expected bounded plain JSON action input')
const variants = v.variant('action', [
  v.strictObject({ ...envelope, action: v.literal('clear-history') }),
  v.strictObject({ ...envelope, action: v.literal('clear-cache') }),
  v.strictObject({ ...envelope, action: v.literal('write-cache-item'), collection, item }),
  v.strictObject({ ...envelope, action: v.literal('delete-cache-item'), collection, key: KeySchema }),
  v.strictObject({ ...envelope, action: v.literal('create-item'), collection, item }),
  v.strictObject({ ...envelope, action: v.literal('update-item'), collection, key: KeySchema, item }),
  v.strictObject({ ...envelope, action: v.literal('delete-item'), collection, key: KeySchema }),
])
/** Validate descriptors and total budget before schema reads any field. */
export const ActionSchema = v.pipe(v.custom<JsonValue>(isActionJson, 'Invalid or over-budget action envelope'), variants)
/** Validated command envelope dispatched by shared executor. */
export type Action = v.InferOutput<typeof ActionSchema>
/** Successful result distinguishes queue acceptance from completed effects. */
export const ActionResultSchema = v.strictObject({
  target: TargetSchema,
  commandId: v.string(),
  action: v.picklist(ACTION_NAMES),
  status: v.picklist(['accepted', 'completed']),
  queued: v.optional(v.boolean()),
  result: v.optional(PreviewValueSchema),
  revisions: v.record(v.string(), v.pipe(v.number(), v.integer(), v.minValue(0))),
})
/** Action outcome, including projected detached result. */
export type ActionResult = v.InferOutput<typeof ActionResultSchema>
/** Validate transport or local action using one authoritative schema. */
export function parseAction(input: unknown): Action {
  return v.parse(ActionSchema, input)
}
