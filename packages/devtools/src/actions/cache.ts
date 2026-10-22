import type { CacheOperationResult, ResolvedCollection } from '@rstore/shared'
import type { Action } from '../protocol'
import type { StoreRegistration } from '../runtime/types'
import { DevtoolsError } from '../protocol'

/** Only an explicit completion capability can certify an operation's receipt. */
function submitOperation(legacy: () => void, completion?: () => CacheOperationResult): CacheOperationResult | undefined {
  if (completion)
    return completion()
  legacy()
}

/** Dispatch diagnostic/cache actions only through public methods. */
export function executeCacheAction(registration: StoreRegistration, action: Action, collection?: ResolvedCollection) {
  const cache = registration.store.$cache
  let receipt: void | CacheOperationResult
  let result: unknown
  switch (action.action) {
    case 'clear-history':
      registration.history.clear()
      receipt = { status: 'completed' }
      break
    case 'clear-cache':
      receipt = submitOperation(() => cache.clear(), cache.receipts && (() => cache.receipts!.clear()))
      registration.invalidate('cache')
      break
    case 'delete-cache-item':
      receipt = submitOperation(
        () => cache.deleteItem({ collection: collection!, key: action.key }),
        cache.receipts && (() => cache.receipts!.deleteItem({ collection: collection!, key: action.key })),
      )
      registration.invalidate('cache')
      break
    case 'write-cache-item': {
      const item = action.item as Record<string, unknown>
      const key = collection!.getKey(item)
      if (typeof key !== 'string' && !(typeof key === 'number' && Number.isFinite(key)))
        throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', target: action.target, commandId: action.commandId, message: 'Cache item has no valid collection key' })
      receipt = submitOperation(
        () => cache.writeItem({ collection: collection!, key, item }),
        cache.receipts && (() => cache.receipts!.writeItem({ collection: collection!, key, item })),
      )
      registration.invalidate('cache')
      result = item
      break
    }
    default:
      throw new DevtoolsError({ code: 'INVALID_ARGUMENTS', target: action.target, commandId: action.commandId, message: 'Unsupported cache action' })
  }
  // Legacy return values are ignored: void callbacks may implicitly return anything.
  return { result, queued: receipt?.status !== 'completed' }
}
