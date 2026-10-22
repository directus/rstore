import type { Action, ActionResult, ReadReply, SessionSummary, Target, ViewName } from '../../src/protocol'
import type { RuntimeInvalidation } from '../../src/runtime/types'

/** Connection status rendered by inspector, without transport-specific assumptions. */
export type ConnectionStatus = 'connecting' | 'live' | 'disconnected' | 'authentication-error' | 'incompatible'
/** Detached producer access, implementations own actual transport resources. */
export interface InspectorTransport {
  /** Retrieve current connected and retained sessions. */
  listSessions: () => Promise<SessionSummary[]>
  /** Read one bounded view from exact target. */
  read: (view: ViewName, target: Target, parameters?: Record<string, unknown>) => Promise<ReadReply>
  /** Execute one validated command with stable identity. */
  action: (action: Action) => Promise<ActionResult>
  /** Observe revision invalidations, returned disposer removes observer. */
  subscribe: (listener: (event: RuntimeInvalidation) => void) => () => void
  /** Acquire producer observation only while target/view is visible. */
  watch?: (target: Target, view: ViewName) => Promise<() => void>
  /** Observe connection status transitions. */
  onStatus?: (listener: (status: ConnectionStatus) => void) => () => void
  /** Release channel and all listeners. */
  dispose: () => void
}
