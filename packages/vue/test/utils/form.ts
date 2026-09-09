import { normalizeCollectionRelations, resolveCollections } from '@rstore/core'
import { relationSchema } from './relationStore'

/** Resolves relation metadata from a public schema instead of recreating cache internals. */
export function relationCollection() {
  const collections = resolveCollections(relationSchema)
  normalizeCollectionRelations(collections)
  return collections[0]!
}
