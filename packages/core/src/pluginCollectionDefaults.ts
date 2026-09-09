import type { CollectionDefaults, ResolvedCollection, StoreSchema } from '@rstore/shared'
import { isCollection, resolveCollection } from './collection'

/**
 * Apply defaults registered during plugin setup to collections resolved before setup.
 *
 * Collection objects stay stable because Vue APIs and relation indexes already
 * reference them. Only properties derived from `CollectionDefaults` are refreshed.
 */
export function applyPluginCollectionDefaults(
  collections: ResolvedCollection[],
  schema: StoreSchema,
  defaults: CollectionDefaults,
): void {
  for (const definition of schema) {
    if (!isCollection(definition)) {
      continue
    }
    const collection = collections.find(item => item.name === definition.name)
    if (!collection) {
      continue
    }
    const refreshed = resolveCollection(definition, defaults)
    collection.getKey = refreshed.getKey
    collection.isInstanceOf = refreshed.isInstanceOf
    collection.computed = refreshed.computed
    collection.fields = refreshed.fields
    collection.meta = refreshed.meta
  }
}
