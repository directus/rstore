import * as v from 'valibot'
import { TargetSchema } from './identity'

/** Stable errors across browser, RPC, and MCP surfaces. */
export const ErrorCodeSchema = v.picklist([
  'INVALID_ARGUMENTS',
  'TARGET_NOT_FOUND',
  'READ_ONLY',
  'UNAVAILABLE',
  'STALE_TARGET',
  'CAPABILITY_UNAVAILABLE',
  'PROTOCOL_MISMATCH',
  'CAPACITY',
  'BACKEND_FAILURE',
  'UNKNOWN_OUTCOME',
  'COMMAND_CONFLICT',
  'COMMAND_EXPIRED',
])
/** Error payload contains useful messages without credential-bearing stack traces. */
export const ProtocolErrorSchema = v.strictObject({
  code: ErrorCodeSchema,
  message: v.string(),
  target: v.optional(TargetSchema),
  commandId: v.optional(v.string()),
  outcome: v.optional(v.picklist(['accepted', 'completed', 'unknown'])),
})
/** Stable protocol error code. */
export type ErrorCode = v.InferOutput<typeof ErrorCodeSchema>
/** Serialized failure returned by all transports. */
export type ProtocolError = v.InferOutput<typeof ProtocolErrorSchema>
/** Error with transport-safe details, preserving normal Error ergonomics locally. */
export class DevtoolsError extends Error {
  /** Structured payload returned to consumers. */
  readonly details: ProtocolError
  /** Construct a meaningful boundary error. */
  constructor(details: ProtocolError) {
    super(details.message)
    this.name = 'DevtoolsError'
    this.details = details
  }
}
