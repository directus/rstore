/**
 * Default scope id assigned to generated Directus collections and plugins.
 */
export const DEFAULT_DIRECTUS_SCOPE_ID = 'rstore-directus'

/**
 * Directus metadata stored on generated rstore collections.
 */
export interface DirectusGeneratedCollectionMeta {
  /**
   * Primary key field names discovered from Directus field schemas.
   */
  primaryKeys: string[]

  /**
   * Directus-specific collection metadata.
   */
  directus: {
    /**
     * Original Directus collection name.
     */
    collection: string

    /**
     * Whether the Directus collection is configured as a singleton.
     */
    singleton: boolean
  }
}

/**
 * Minimal collection shape required by Directus runtime helpers.
 */
export interface DirectusCollectionLike {
  /**
   * rstore collection name.
   */
  name: string

  /**
   * Directus metadata generated on the collection.
   */
  meta?: Partial<DirectusGeneratedCollectionMeta>
}

/**
 * Returns whether a generated collection represents a Directus singleton.
 */
export function isDirectusSingleton(collection: DirectusCollectionLike): boolean {
  return collection.meta?.directus?.singleton === true
}

/**
 * Returns generated Directus primary keys or the default Directus `id` key.
 */
export function getDirectusPrimaryKeys(collection: DirectusCollectionLike): string[] {
  return collection.meta?.primaryKeys?.length ? collection.meta.primaryKeys : ['id']
}
