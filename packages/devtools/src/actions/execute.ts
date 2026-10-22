import type { ResolvedCollection } from '@rstore/shared'
import type { Action, ActionResult } from '../protocol'
import type { RstoreDevtools, StoreRegistration } from '../runtime/types'
import { collectionActions } from '../inspection/collections'
import { projectValue } from '../projection'
import { DevtoolsError } from '../protocol'
import { executeCacheAction } from './cache'
import { executeCollectionAction } from './collections'
import { CommandLedger } from './commands'
import { backendMessage, validateAction, validateCollectionItem } from './validation'

/** Weak registration keys release completed ledgers when authority is disposed. */
const ledgers = new WeakMap<StoreRegistration, CommandLedger>()

/** Remove replay evidence when authority ends, even if a consumer retains disposed registration. */
export function releaseActionRegistration(registration: StoreRegistration): void {
  ledgers.delete(registration)
}

/** Runtime surface needed by authoritative command execution. */
type ActionRuntime = Pick<RstoreDevtools, 'resolve'>

/** Validate registration capabilities and exact collection before any effect. */
function resolveAction(runtime: ActionRuntime, action: Action) {
  const registration = runtime.resolve(action.target)
  if (registration.readOnly || registration.capabilities.readOnly)
    throw new DevtoolsError({ code: 'READ_ONLY', target: action.target, commandId: action.commandId, message: 'Target is read-only' })
  const backend = ['create-item', 'update-item', 'delete-item'].includes(action.action)
  if (backend ? !registration.capabilities.backendMutations : action.action !== 'clear-history' && !registration.capabilities.cacheWrites)
    throw new DevtoolsError({ code: 'CAPABILITY_UNAVAILABLE', target: action.target, commandId: action.commandId, message: 'Target does not support requested action' })
  const collection = 'collection' in action ? registration.store.$collections.find(item => item.name === action.collection) : undefined
  if ('collection' in action && !collection)
    throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', target: action.target, commandId: action.commandId, message: 'Unknown collection' })
  if (backend && !collectionActions(registration, collection!).includes(action.action))
    throw new DevtoolsError({ code: 'CAPABILITY_UNAVAILABLE', target: action.target, commandId: action.commandId, message: 'Collection does not support requested action' })
  const methods: Partial<Record<Action['action'], string>> = { 'write-cache-item': 'writeItem', 'delete-cache-item': 'deleteItem', 'clear-cache': 'clear' }
  const method = methods[action.action]
  if (method && typeof (registration.store.$cache as unknown as Record<string, unknown>)[method] !== 'function')
    throw new DevtoolsError({ code: 'CAPABILITY_UNAVAILABLE', message: 'Public cache operation unavailable' })
  return { registration, collection, backend }
}

/** Execute one bounded exact-target command with replay protection shared across all hosts. */
export async function executeAction(runtime: ActionRuntime, input: unknown): Promise<ActionResult> {
  const { action, fingerprint } = validateAction(input)
  const { registration } = resolveAction(runtime, action)
  let ledger = ledgers.get(registration)
  if (!ledger) {
    ledger = new CommandLedger()
    ledgers.set(registration, ledger)
  }
  const outcome = await ledger.run(action.commandId, action.issuedAt, fingerprint, async () => {
    // Schema validation can await application code: recheck ownership both before and after.
    const candidate = resolveAction(runtime, action)
    if (candidate.collection)
      await validateCollectionItem(action, candidate.collection as ResolvedCollection)
    const current = resolveAction(runtime, action)
    let result: unknown
    let queued = false
    try {
      if (current.backend) {
        const effect = await executeCollectionAction(current.registration, action, current.collection!)
        result = effect.result
        queued = effect.queued
      }
      else {
        const effect = executeCacheAction(current.registration, action, current.collection)
        result = effect.result
        queued = effect.queued
      }
    }
    catch (error) {
      if (error instanceof DevtoolsError)
        throw error
      throw new DevtoolsError({ code: 'BACKEND_FAILURE', target: action.target, commandId: action.commandId, message: backendMessage(error) })
    }
    return {
      target: { ...action.target },
      commandId: action.commandId,
      action: action.action,
      status: queued ? 'accepted' : 'completed',
      ...(queued ? { queued: true } : {}),
      ...(result === undefined ? {} : { result: projectValue(result, { unwrap: registration.adapter?.unwrap }).value }),
      revisions: { ...registration.revisions },
    } satisfies ActionResult
  }).catch((error: unknown) => {
    // Failure records are shared like successful outcomes. Expose a fresh error
    // so one local consumer cannot rewrite another consumer's replay evidence.
    if (error instanceof DevtoolsError)
      throw new DevtoolsError(JSON.parse(JSON.stringify(error.details)))
    throw error
  })
  // Each consumer receives a detached outcome; editing a preview cannot poison future replays.
  return JSON.parse(JSON.stringify(outcome)) as ActionResult
}
