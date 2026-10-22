import * as v from 'valibot'
import { TargetSchema } from './identity'

/** Exact public views with independent read invalidation revisions. */
export const ViewSchema = v.picklist(['collections', 'cache', 'history', 'subscriptions', 'modules', 'plugins'])
/** Shared observation lease address; transport owns its lease token separately. */
export const WatchRequestSchema = v.strictObject({ target: TargetSchema, view: ViewSchema })
/** Observation lease target and selected view. */
export type WatchRequest = v.InferOutput<typeof WatchRequestSchema>
/** Detached revision notification; registration lifecycle may omit target. */
export const RuntimeInvalidationSchema = v.strictObject({
  target: v.optional(TargetSchema),
  view: v.picklist([...ViewSchema.options, 'registry']),
  revision: v.pipe(v.number(), v.integer(), v.minValue(0)),
})
/** Wire-safe revision notification accepted by transports. */
export type WireInvalidation = v.InferOutput<typeof RuntimeInvalidationSchema>
