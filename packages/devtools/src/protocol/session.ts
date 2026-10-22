import * as v from 'valibot'
import { TargetSchema } from './identity'
import { PreviewValueSchema } from './preview'

/** Reject control characters without sanitizing or copying request data. */
function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code < 32 || code === 127)
      return true
  }
  return false
}

/** Available public operations, not inferred from private implementation fields. */
export const CapabilitiesSchema = v.strictObject({
  cacheInspection: v.boolean(),
  moduleObservation: v.boolean(),
  cacheWrites: v.boolean(),
  backendMutations: v.boolean(),
  readOnly: v.boolean(),
})
/** Store summary suitable for target selection. */
export const StoreSummarySchema = v.strictObject({
  target: TargetSchema,
  label: v.string(),
  capabilities: CapabilitiesSchema,
})
/** Detached SSR request details exclude query strings, headers and body. */
export const SessionRequestSchema = v.pipe(v.strictObject({
  path: v.pipe(v.string(), v.minLength(1), v.maxLength(8192), v.check(path => !/[?#]/.test(path) && !hasControlCharacters(path), 'Expected safe request path')),
  method: v.pipe(v.string(), v.minLength(1), v.maxLength(32), v.check(method => !hasControlCharacters(method), 'Expected safe HTTP method')),
  startedAt: v.pipe(v.number(), v.finite()),
  completedAt: v.optional(v.pipe(v.number(), v.finite())),
  duration: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0))),
  status: v.picklist(['active', 'completed', 'error', 'aborted']),
  error: v.optional(PreviewValueSchema),
}), v.check(request => request.status === 'active' || (request.completedAt !== undefined && request.duration !== undefined), 'Terminal request requires timing metadata'))
/** Safe active or terminal SSR request metadata, using epoch milliseconds. */
export type SessionRequest = v.InferOutput<typeof SessionRequestSchema>
/** Session summary; timestamps use epoch milliseconds. */
export const SessionSummarySchema = v.pipe(v.strictObject({
  sessionId: v.pipe(v.string(), v.minLength(1)),
  kind: v.picklist(['browser', 'node', 'ssr']),
  label: v.string(),
  connected: v.boolean(),
  completed: v.boolean(),
  startedAt: v.pipe(v.number(), v.finite()),
  completedAt: v.optional(v.pipe(v.number(), v.finite())),
  stores: v.array(StoreSummarySchema),
  request: v.optional(SessionRequestSchema),
}), v.check(session => session.request === undefined || session.kind === 'ssr', 'Only SSR sessions carry request metadata'))
/** Explicit inspection and action capabilities. */
export type Capabilities = v.InferOutput<typeof CapabilitiesSchema>
/** Registered store summary. */
export type StoreSummary = v.InferOutput<typeof StoreSummarySchema>
/** Connected or retained session description. */
export type SessionSummary = v.InferOutput<typeof SessionSummarySchema>
/** Producer session category. */
export type SessionKind = SessionSummary['kind']
