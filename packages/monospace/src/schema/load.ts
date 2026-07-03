import type { MonospaceFetch } from '../runtime'
import type { MonospaceCollectionDefinition } from './introspection'
import type { MonospaceOpenApiDocument, MonospacePrimaryKeyConfig } from './types'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { buildMonospaceCollections } from './introspection'

/**
 * Options used to load generated rstore collections from Monospace.
 */
export interface LoadMonospaceCollectionsOptions {
  /**
   * Monospace API URL for remote OpenAPI loading.
   */
  url?: string

  /**
   * Monospace project identifier for remote OpenAPI loading.
   */
  project?: string

  /**
   * Build-time API key used only for remote OpenAPI loading.
   */
  schemaApiKey?: string

  /**
   * Local OpenAPI JSON file path.
   */
  input?: string

  /**
   * rstore plugin scope id assigned to generated collections.
   */
  scopeId: string

  /**
   * Explicit primary key overrides keyed by collection name.
   */
  primaryKeys?: MonospacePrimaryKeyConfig

  /**
   * Fetch implementation used by remote OpenAPI loading.
   */
  fetch?: MonospaceFetch
}

/**
 * Loads Monospace metadata and transforms it into rstore collection definitions.
 */
export async function loadMonospaceCollections(
  options: LoadMonospaceCollectionsOptions,
): Promise<MonospaceCollectionDefinition[]> {
  const document = options.input
    ? await loadLocalOpenApiDocument(options.input)
    : await loadRemoteOpenApiDocument(options)

  return buildMonospaceCollections({
    document,
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
 * Fetches a remote Monospace OpenAPI document.
 */
export async function loadRemoteOpenApiDocument(
  options: Pick<LoadMonospaceCollectionsOptions, 'fetch' | 'project' | 'schemaApiKey' | 'url'>,
): Promise<MonospaceOpenApiDocument> {
  if (!options.url || !options.project) {
    throw new Error('@rstore/monospace requires url and project options to load remote OpenAPI schema')
  }

  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis)
  const response = await fetchFn(`${trimTrailingSlash(options.url)}/api/${encodeURIComponent(options.project)}/openapi`, {
    headers: createSchemaHeaders(options.schemaApiKey),
  })
  const document = await response.json() as unknown
  if (!response.ok) {
    throw new Error(`Failed to load Monospace OpenAPI schema: ${response.status}`)
  }
  assertOpenApiDocument(document, `${options.url}/api/${options.project}/openapi`)
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
