import type { MonospaceCollectionDefinition } from './introspection'
import type { MonospaceSchemaMetadata } from './metadataTypes'
import type { LoadRemoteMonospaceSchemaOptions } from './remote'
import type { MonospaceOpenApiDocument, MonospacePrimaryKeyConfig } from './types'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { buildMonospaceCollections } from './introspection'
import { assertMonospaceSchemaMetadata } from './metadata'
import { fetchRemoteSchemaJson, remoteWorkspaceUrl } from './remote'
import { loadRemoteSchemaMetadata } from './structure'

export type { LoadRemoteMonospaceSchemaOptions } from './remote'
export { loadRemoteSchemaMetadata } from './structure'

/**
 * Options used to load generated rstore collections from Monospace.
 */
export interface LoadMonospaceCollectionsOptions extends LoadRemoteMonospaceSchemaOptions {
  /**
   * Local OpenAPI JSON file path.
   */
  input?: string

  /**
   * Local schema metadata snapshot JSON file path: the raw items of the
   * Monospace system schema meta collections keyed by meta collection name
   * (see {@link MonospaceSchemaMetadata}), as returned by
   * {@link loadRemoteSchemaMetadata}. Required alongside `input` for fully
   * offline generation.
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
}

/**
 * Loads Monospace schema information and transforms it into rstore
 * collection definitions.
 *
 * Both the OpenAPI document and the schema metadata are required: the
 * document describes the REST response shapes while the meta collections
 * provide the primary indexes and FK constraints. Each source is loaded from
 * its local file when provided (`input` / `metadataInput`) and from the
 * remote workspace otherwise.
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
 * Fetches a remote Monospace OpenAPI document. The schema API key needs the
 * `openApiSchema:read` entitlement.
 */
export async function loadRemoteOpenApiDocument(
  options: LoadRemoteMonospaceSchemaOptions,
): Promise<MonospaceOpenApiDocument> {
  const url = `${remoteWorkspaceUrl(options, 'OpenAPI schema')}/openapi`
  const document = await fetchRemoteSchemaJson(options, url, 'OpenAPI schema')
  assertOpenApiDocument(document, url)
  return document
}

/**
 * Asserts that a value is an OpenAPI document.
 */
function assertOpenApiDocument(value: unknown, source: string): asserts value is MonospaceOpenApiDocument {
  if (typeof value !== 'object' || value === null || !('openapi' in value)) {
    throw new Error(`Expected an OpenAPI document from ${source}`)
  }
}
