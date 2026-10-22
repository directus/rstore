import type { RegisteredPlugin, ResolvedCollection } from '@rstore/shared'
import type { CollectionSummary } from '../protocol'
import type { StoreRegistration } from '../runtime/types'
import type { InspectionContext } from './context'
import { inspectCache } from './context'

/** Mirror Core's per-hook scope filtering when its payload has a collection. */
function hasCollectionHook(plugin: RegisteredPlugin, name: string, collection: ResolvedCollection): boolean {
  return plugin.hooks[name]?.some(hook => hook.options?.ignoreScope
    || !plugin.scopeId || !collection.scopeId || plugin.scopeId === collection.scopeId) ?? false
}

/** Declared supported backend actions, respecting plugin scope and builtin hooks. */
export function collectionActions(registration: StoreRegistration, collection: ResolvedCollection): string[] {
  if (registration.readOnly)
    return []
  return ['create', 'update', 'delete'].filter((action) => {
    if (collection.hooks?.[action as 'create'])
      return true
    return registration.store.$plugins.some((plugin) => {
      if (plugin.meta?.builtin)
        return false
      if (hasCollectionHook(plugin, `${action}Item`, collection))
        return true
      // Mutation batching adds two dispatch tiers. Unified batches have no
      // collection in their payload, so Core never filters that hook by scope.
      return Boolean(registration.store.$batch?.options.mutations
        && ((plugin.hooks.batch?.length ?? 0) > 0 || hasCollectionHook(plugin, 'batchMutate', collection)))
    })
  }).map(action => `${action}-item`)
}

/** Describe schema without exposing methods, fetching data, or private cache. */
export function readCollections(registration: StoreRegistration, context: InspectionContext): CollectionSummary[] {
  const inspection = inspectCache(registration)
  const result: CollectionSummary[] = []
  for (const collection of registration.store.$collections) {
    if (result.length >= 1000 || context.remainingBytes < 1024) {
      context.markTruncated()
      break
    }
    result.push({
      name: collection.name,
      virtual: Boolean((collection.meta as Record<string, unknown> | undefined)?.virtual),
      relations: context.project(collection.normalizedRelations),
      actions: collectionActions(registration, collection),
      count: inspection?.collections.find(candidate => candidate.name === collection.name)?.effectiveCount,
    })
  }
  return result
}
