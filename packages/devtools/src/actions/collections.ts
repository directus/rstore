import type { CustomHookMeta, ResolvedCollection } from '@rstore/shared'
import type { Action } from '../protocol'
import type { StoreRegistration } from '../runtime/types'
import { createItem, deleteItem, updateItem } from '@rstore/core'

/** Preserve Core hooks, serialization, optimistic layers, batching and offline queue behavior. */
export async function executeCollectionAction(registration: StoreRegistration, action: Action, collection: ResolvedCollection) {
  const meta: CustomHookMeta = {}
  const common = { store: registration.store, collection, meta }
  let result: unknown
  switch (action.action) {
    case 'create-item':
      result = await createItem({ ...common, item: action.item as Record<string, unknown> })
      break
    case 'update-item':
      result = await updateItem({ ...common, key: action.key, item: action.item as Record<string, unknown> })
      break
    case 'delete-item':
      await deleteItem({ ...common, key: action.key })
      break
  }
  return { result, queued: meta.mutationStatus === 'queued' }
}
