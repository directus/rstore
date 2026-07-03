import type { DirectusCollection, DirectusField, DirectusRelation } from '@directus/sdk'
import type { DirectusCollectionDefinition } from './introspection'
import {
  createDirectus,
  readCollections,
  readFieldsByCollection,
  readRelations,
  rest,
  staticToken,
} from '@directus/sdk'
import { DEFAULT_DIRECTUS_SCOPE_ID } from '../runtime'
import { buildDirectusCollections } from './introspection'

/**
 * Options used to load generated rstore collections from Directus.
 */
export interface LoadDirectusCollectionsOptions {
  /**
   * Directus API URL.
   */
  url: string

  /**
   * Admin token for build-time Directus introspection.
   */
  adminToken: string

  /**
   * rstore plugin scope id for generated Directus collections.
   */
  scopeId?: string
}

/**
 * Loads Directus metadata and transforms it into rstore collection definitions.
 */
export async function loadDirectusCollections(
  options: LoadDirectusCollectionsOptions,
): Promise<DirectusCollectionDefinition[]> {
  const scopeId = options.scopeId ?? DEFAULT_DIRECTUS_SCOPE_ID
  const directus = createDirectus(options.url)
    .with(rest())
    .with(staticToken(options.adminToken))

  const directusCollections = await directus.request(readCollections()) as DirectusCollection[]
  const fieldsPerCollection = await readFieldsPerCollection(directus, directusCollections)
  const relations = await directus.request(readRelations()) as DirectusRelation[]

  return buildDirectusCollections({
    collections: directusCollections,
    fields: fieldsPerCollection,
    relations,
    scopeId,
  })
}

/**
 * Reads all Directus fields grouped by collection name.
 */
async function readFieldsPerCollection(
  directus: ReturnType<typeof createDirectus> & { request: (command: any) => Promise<unknown> },
  collections: DirectusCollection[],
): Promise<Map<string, DirectusField[]>> {
  const fieldsPerCollection = new Map<string, DirectusField[]>()
  await Promise.all(collections.map(async (collection) => {
    if (!collection.schema || collection.collection.startsWith('directus_')) {
      return
    }
    const fields = await directus.request(readFieldsByCollection(collection.collection)) as DirectusField[]
    fieldsPerCollection.set(collection.collection, fields)
  }))
  return fieldsPerCollection
}
