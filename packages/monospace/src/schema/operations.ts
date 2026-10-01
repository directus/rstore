import type { MonospaceCollectionOperation } from '../runtime'
import type { MonospaceOpenApiDocument, OpenApiReferenceObject } from './types'

/**
 * Item API operations served by each HTTP method of the collection
 * (`many`) path, in declaration order.
 */
const MANY_PATH_OPERATIONS: Array<[method: string, operation: MonospaceCollectionOperation]> = [
  ['get', 'readMany'],
  ['post', 'create'],
  ['patch', 'updateMany'],
  ['delete', 'deleteMany'],
]

/**
 * Item API operations served by each HTTP method of the single-item
 * (`one`, `/{key}`) path, in declaration order.
 */
const ONE_PATH_OPERATIONS: Array<[method: string, operation: MonospaceCollectionOperation]> = [
  ['get', 'readOne'],
  ['patch', 'updateOne'],
  ['delete', 'deleteOne'],
]

const PATH_REF_PREFIX = '#/paths/'

/**
 * Number of item API operations a fully featured collection serves.
 */
export const MONOSPACE_COLLECTION_OPERATION_COUNT = MANY_PATH_OPERATIONS.length + ONE_PATH_OPERATIONS.length

/**
 * Item API capabilities of one collection, read from its OpenAPI mappings.
 */
export interface MonospaceCollectionCapabilities {
  /**
   * Whether the collection has single-item `/{key}` routes. Collections
   * without a single-column primary key have none.
   */
  itemRoutes: boolean

  /**
   * Operations the collection serves, or `undefined` when the mapped paths
   * are missing from the document (operations are then unknown).
   */
  operations?: MonospaceCollectionOperation[]
}

/**
 * Reads the item API capabilities of a collection from the HTTP methods of
 * the paths referenced by its `x-monospace-mappings` entry.
 *
 * Monospace only lists the operations a collection serves: extension
 * connector collections omit undeclared operations, and collections without
 * a single-column primary key have no `one` mapping.
 */
export function detectMonospaceCollectionCapabilities(
  document: MonospaceOpenApiDocument,
  collectionName: string,
): MonospaceCollectionCapabilities {
  const mapping = document['x-monospace-mappings']?.[collectionName]
  const manyPath = resolvePathRef(document, mapping?.many)
  const onePath = resolvePathRef(document, mapping?.one)
  const itemRoutes = mapping?.one != null

  if (!manyPath || (itemRoutes && !onePath)) {
    return { itemRoutes }
  }

  return {
    itemRoutes,
    operations: [
      ...pathOperations(manyPath, MANY_PATH_OPERATIONS),
      ...onePath ? pathOperations(onePath, ONE_PATH_OPERATIONS) : [],
    ],
  }
}

/**
 * Returns the operations served by the declared methods of a path item.
 */
function pathOperations(
  pathItem: Record<string, unknown>,
  operations: Array<[method: string, operation: MonospaceCollectionOperation]>,
): MonospaceCollectionOperation[] {
  return operations
    .filter(([method]) => pathItem[method] != null)
    .map(([, operation]) => operation)
}

/**
 * Resolves a `#/paths/...` JSON pointer reference to its path item.
 *
 * Pointer tokens may be URI-encoded (`%7Bkey%7D`) and use the JSON pointer
 * escapes `~1` (`/`) and `~0` (`~`).
 */
function resolvePathRef(
  document: MonospaceOpenApiDocument,
  ref: OpenApiReferenceObject | undefined,
): Record<string, unknown> | undefined {
  if (!ref?.$ref.startsWith(PATH_REF_PREFIX)) {
    return undefined
  }
  const path = decodeURIComponent(ref.$ref.slice(PATH_REF_PREFIX.length))
    .replaceAll('~1', '/')
    .replaceAll('~0', '~')
  const pathItem = document.paths?.[path]
  return typeof pathItem === 'object' && pathItem !== null
    ? pathItem as Record<string, unknown>
    : undefined
}
