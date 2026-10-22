import type { Action, ActionName, ActionResult, ProtocolError, ReadRequest } from '../protocol'
import type { RuntimeInvalidation } from '../runtime/types'
import * as v from 'valibot'
import { ProtocolErrorSchema, WatchRequestSchema } from '../protocol'

/** Devframe owns handshake/versioning for this uniquely named protocol. */
export const CHANNEL_NAME = 'rstore:devtools:v1'
/** Structured failures retain protocol details across MessagePort error serialization. */
export type ChannelResult<T = unknown> = { ok: true, value: T } | { ok: false, error: ProtocolError }
/** Every reply is a detached DTO; Devframe additionally enforces JSON serializability. */
export const ChannelResultSchema = v.variant('ok', [
  v.strictObject({ ok: v.literal(true), value: v.unknown() }),
  v.strictObject({ ok: v.literal(false), error: ProtocolErrorSchema }),
])
/** Attach authoritative view/action result schemas to Devframe declarations. */
export function channelResultSchema<S extends v.GenericSchema>(value: S) {
  return v.variant('ok', [
    v.strictObject({ ok: v.literal(true), value }),
    v.strictObject({ ok: v.literal(false), error: ProtocolErrorSchema }),
  ])
}
/** Observation lease; bounded lifetime cleans abandoned panels without owning their stores. */
export const WatchSchema = v.strictObject({
  ...WatchRequestSchema.entries,
  subscriptionId: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  active: v.boolean(),
})
/** Shared observation request type. */
export type WatchRequest = v.InferOutput<typeof WatchSchema>
/** Read function arguments share public schemas and discriminate by the called method. */
type ReadFunctions = {
  [K in ReadRequest['method']]: (input: Omit<Extract<ReadRequest, { method: K }>, 'method'>) => Promise<ChannelResult>
}
/** Mutating calls retain exact action identity and full deduplication envelope. */
type ActionFunctions = {
  [K in ActionName as `rstore:${K}`]: (input: Action) => Promise<ChannelResult<ActionResult>>
}
/** One shared contract consumed by both official Devframe endpoints. */
export interface BrowserChannelProtocol {
  /** Functions owned by the page producer. */
  functions: {
    /** Public reads/actions plus internal observation lease. */
    pageScript: ReadFunctions & ActionFunctions & {
      'rstore:watch': (input: WatchRequest) => Promise<ChannelResult<null>>
    }
    /** Inspector exposes no remotely callable application methods. */
    panel: Record<string, never>
  }
  /** Detached revisions are hints to fetch a selected bounded view. */
  events: {
    /** Page producer emits no arbitrary executable callbacks. */
    pageScript: Record<string, never>
    /** Page-to-panel notifications. */
    panel: { 'rstore:invalidate': (event: RuntimeInvalidation) => void }
  }
}
