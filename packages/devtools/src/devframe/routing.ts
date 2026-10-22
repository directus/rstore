import type { Action, ReadRequest, SessionSummary } from '../protocol'
import type { RstoreDevtools } from '../runtime/types'
import type { ProducerRegistry } from './producer-registry'
import { executeAction } from '../actions'
import { DevtoolsError } from '../protocol'

/** Serial wire outcome preserves shared failures across owner round trips. */
export type ProducerOutcome = { ok: true, value: unknown } | { ok: false, error: import('../protocol').ProtocolError }
/** Release timeout after settlement; late producer work never becomes an automatic retry. */
function boundedOwnerCall(operation: Promise<unknown>, action: boolean): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Producer call deadline exceeded')), action ? 30_000 : 10_000)
    operation.then((value) => {
      clearTimeout(timer)
      resolve(value)
    }, (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}
/** Public local/remote dispatch uses same neutral runtime and action executor. */
export function createRelayDispatch(registry: ProducerRegistry, runtime?: RstoreDevtools) {
  /** Read summaries from local runtime and current external registrations. */
  function sessions(): SessionSummary[] {
    return [...(runtime ? [runtime.session] : []), ...registry.list()]
  }
  /** Capture target and epoch before calling exactly one owner RPC. */
  async function route(request: ReadRequest | Action, action = false): Promise<unknown> {
    const sessionId = 'target' in request ? request.target.sessionId : 'sessionId' in request ? request.sessionId : undefined
    if (!action && 'method' in request && request.method === 'rstore:list-sessions')
      return sessions()
    if (runtime && runtime.session.sessionId === sessionId)
      return action ? executeAction(runtime, request) : runtime.read(request as ReadRequest)
    if (!sessionId)
      throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', message: 'Explicit producer session required' })
    const record = registry.get(sessionId)
    if (record.read) {
      if (action)
        throw new DevtoolsError({ code: 'READ_ONLY', message: 'Completed SSR snapshots are read-only' })
      return record.read(request as ReadRequest)
    }
    const owner = record.owner!
    if ('target' in request && !record.summary.stores.some(store => store.target.storeId === request.target.storeId && store.target.generation === request.target.generation))
      throw new DevtoolsError({ code: 'STALE_TARGET', message: 'Store generation unavailable', target: request.target })
    if (action && 'target' in request && record.summary.stores.find(store => store.target.storeId === request.target.storeId)?.capabilities.readOnly)
      throw new DevtoolsError({ code: 'READ_ONLY', message: 'Registration is read-only', target: request.target })
    let outcome: ProducerOutcome
    try {
      const call = owner.session.rpc.$call as (method: string, ...args: unknown[]) => Promise<unknown>
      outcome = await boundedOwnerCall(call('rstore:producer-dispatch', { kind: action ? 'action' : 'read', request }), action) as ProducerOutcome
    }
    catch {
      throw new DevtoolsError({ code: action ? 'UNKNOWN_OUTCOME' : 'UNAVAILABLE', message: action ? 'Producer disconnected before action outcome was known' : 'Producer read unavailable', ...('target' in request ? { target: request.target } : {}), ...(action && 'commandId' in request ? { commandId: request.commandId, outcome: 'unknown' as const } : {}) })
    }
    if (!registry.isCurrent(sessionId, owner) || ('target' in request && !registry.get(sessionId).summary.stores.some(store => store.target.storeId === request.target.storeId && store.target.generation === request.target.generation)))
      throw new DevtoolsError({ code: action ? 'UNKNOWN_OUTCOME' : 'STALE_TARGET', message: 'Producer connection changed during call', ...(action ? { outcome: 'unknown' as const } : {}) })
    if (!outcome.ok)
      throw new DevtoolsError(outcome.error)
    return outcome.value
  }
  return { sessions, route }
}
