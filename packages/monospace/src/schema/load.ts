import type { MonospaceFetch } from '../runtime'
import type { MonospaceCollectionDefinition } from './introspection'
import type { MonospaceSchemaMetadata } from './metadataTypes'
import type { MonospaceOpenApiDocument, MonospacePrimaryKeyConfig } from './types'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { buildMonospaceCollections } from './introspection'
import { assertMonospaceSchemaMetadata } from './metadata'

/**
 * Options used to load generated rstore collections from Monospace.
 */
export interface LoadMonospaceCollectionsOptions {
  /**
   * Monospace API URL for remote schema loading.
   */
  url?: string

  /**
   * Monospace project identifier for remote schema loading.
   */
  project?: string

  /**
   * Build-time API key used only for remote schema loading. It needs the
   * `openApiSchema:read` and `dataModel:read` entitlements.
   */
  schemaApiKey?: string

  /**
   * Local OpenAPI JSON file path.
   */
  input?: string

  /**
   * Local schema metadata snapshot JSON file path: the raw items of the
   * Monospace system schema meta collections keyed by meta collection name
   * (see {@link MonospaceSchemaMetadata}). Required alongside `input` for
   * fully offline generation.
   */
  metadataInput?: string

  /**
   * rstore plugin scope id assigned to generated collections.
   */
  scopeId: string

  /**
   * Explicit primary key overrides keyed by collection name.
   */
  primaryKeys?: MonospacePrimaryKeyConfig

  /**
   * Fetch implementation used by remote schema loading.
   */
  fetch?: MonospaceFetch
}

/**
 * Remote schema loading options shared by the OpenAPI and metadata loaders.
 */
export type LoadRemoteMonospaceSchemaOptions = Pick<LoadMonospaceCollectionsOptions, 'fetch' | 'project' | 'schemaApiKey' | 'url'>

/**
 * Explicit field selections queried on each schema meta collection.
 */
const SCHEMA_METADATA_QUERIES: Record<keyof MonospaceSchemaMetadata, string[]> = {
  MonospaceCollection: ['id', 'apiName'],
  MonospacePrimitiveField: ['id', 'apiName', 'collectionId'],
  MonospaceSingleRelationField: ['id', 'apiName', 'collectionId', 'oppositeCollectionId', 'isList', 'isNullable', 'constraintId', 'oppositeRelationFieldId'],
  MonospaceSingleConstraintField: ['constraintId', 'constrainedFieldId', 'referencedFieldId', 'order'],
  MonospaceIndex: ['id', 'kind', 'collectionId'],
  MonospaceIndexField: ['indexId', 'fieldId', 'order'],
}

/**
 * Loads Monospace schema information and transforms it into rstore
 * collection definitions.
 *
 * Both the OpenAPI document and the schema metadata are required: the
 * document describes the REST response shapes while the meta collections
 * provide the primary indexes and FK constraints. Each source is loaded from
 * its local file when provided (`input` / `metadataInput`) and from the
 * remote project otherwise.
 */
export async function loadMonospaceCollections(
  options: LoadMonospaceCollectionsOptions,
): Promise<MonospaceCollectionDefinition[]> {
  const [document, metadata] = await Promise.all([
    options.input
      ? loadLocalOpenApiDocument(options.input)
      : loadRemoteOpenApiDocument(options),
    options.metadataInput
      ? loadLocalSchemaMetadata(options.metadataInput)
      : loadRemoteSchemaMetadata(options),
  ])

  return buildMonospaceCollections({
    document,
    metadata,
    primaryKeys: options.primaryKeys,
    scopeId: options.scopeId,
  })
}

/**
 * Reads a local OpenAPI document from disk.
 */
export async function loadLocalOpenApiDocument(input: string): Promise<MonospaceOpenApiDocument> {
  const document = JSON.parse(await readFile(resolve(process.cwd(), input), 'utf8')) as unknown
  assertOpenApiDocument(document, input)
  return document
}

/**
 * Reads a local schema metadata snapshot from disk.
 */
export async function loadLocalSchemaMetadata(metadataInput: string): Promise<MonospaceSchemaMetadata> {
  const metadata = JSON.parse(await readFile(resolve(process.cwd(), metadataInput), 'utf8')) as unknown
  assertMonospaceSchemaMetadata(metadata, metadataInput)
  return metadata
}

/**
 * Fetches a remote Monospace OpenAPI document.
 */
export async function loadRemoteOpenApiDocument(
  options: LoadRemoteMonospaceSchemaOptions,
): Promise<MonospaceOpenApiDocument> {
  const baseUrl = remoteProjectUrl(options, 'OpenAPI schema')
  const response = await resolveFetch(options)(`${baseUrl}/openapi`, {
    headers: createSchemaHeaders(options.schemaApiKey),
  })
  if (!response.ok) {
    throw new Error(`Failed to load Monospace OpenAPI schema: ${response.status}`)
  }
  const document = await response.json() as unknown
  assertOpenApiDocument(document, `${options.url}/api/${options.project}/openapi`)
  return document
}

/**
 * Fetches the Monospace schema metadata by querying the system schema meta
 * collections through the items API.
 *
 * Each collection is queried with an explicit `fields` selection and
 * `limit=0` (unlimited), since the items API returns 100 items by default.
 */
export async function loadRemoteSchemaMetadata(
  options: LoadRemoteMonospaceSchemaOptions,
): Promise<MonospaceSchemaMetadata> {
  const baseUrl = remoteProjectUrl(options, 'schema metadata')
  const fetchFn = resolveFetch(options)
  const headers = createSchemaHeaders(options.schemaApiKey)

  const entries = await Promise.all(Object.entries(SCHEMA_METADATA_QUERIES).map(async ([collection, fields]) => {
    const search = new URLSearchParams({ fields: fields.join(','), limit: '0' })
    const response = await fetchFn(`${baseUrl}/items/${collection}?${search}`, { headers })
    if (!response.ok) {
      throw new Error(`Failed to load Monospace schema metadata (${collection}): ${response.status}. The schema API key needs the dataModel:read entitlement.`)
    }
    return [collection, unwrapDataEnvelope(await response.json() as unknown, collection)] as const
  }))

  const metadata = Object.fromEntries(entries) as unknown
  assertMonospaceSchemaMetadata(metadata, `${options.url}/api/${options.project}/items`)
  return metadata
}

/**
 * Builds the remote project API base URL after validating remote options.
 */
function remoteProjectUrl(options: LoadRemoteMonospaceSchemaOptions, what: string): string {
  if (!options.url || !options.project) {
    throw new Error(`@rstore/monospace requires url and project options to load the remote Monospace ${what}`)
  }
  return `${trimTrailingSlash(options.url)}/api/${encodeURIComponent(options.project)}`
}

/**
 * Resolves the fetch implementation used by remote schema loading.
 */
function resolveFetch(options: LoadRemoteMonospaceSchemaOptions): MonospaceFetch {
  return options.fetch ?? globalThis.fetch.bind(globalThis)
}

/**
 * Unwraps the `{ data }` envelope of an items API list response.
 */
function unwrapDataEnvelope(body: unknown, collection: string): unknown[] {
  const data = typeof body === 'object' && body !== null && 'data' in body
    ? (body as { data: unknown }).data
    : body
  if (!Array.isArray(data)) {
    throw new TypeError(`Expected an item list from the Monospace schema metadata collection ${collection}`)
  }
  return data
}

/**
 * Asserts that a value is an OpenAPI document.
 */
function assertOpenApiDocument(value: unknown, source: string): asserts value is MonospaceOpenApiDocument {
  if (typeof value !== 'object' || value === null || !('openapi' in value)) {
    throw new Error(`Expected an OpenAPI document from ${source}`)
  }
}

/**
 * Creates headers for schema loading.
 */
function createSchemaHeaders(schemaApiKey: string | undefined): Record<string, string> {
  return schemaApiKey
    ? { Authorization: `Bearer ${schemaApiKey}` }
    : {}
}

/**
 * Removes one trailing slash from a URL.
 */
function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
