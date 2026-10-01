import type { MonospaceFetch, MonospaceWorkspaceOptions } from '../runtime'
import { resolveMonospaceWorkspace } from '../runtime/workspace'

/**
 * Remote schema loading options shared by the OpenAPI and metadata loaders.
 */
export interface LoadRemoteMonospaceSchemaOptions extends MonospaceWorkspaceOptions {
  /**
   * Monospace API URL for remote schema loading.
   */
  url?: string

  /**
   * Build-time API key used only for remote schema loading. It needs the
   * `openApiSchema:read` and `dataModel:read` entitlements.
   */
  schemaApiKey?: string

  /**
   * Fetch implementation used by remote schema loading.
   */
  fetch?: MonospaceFetch
}

/**
 * Builds the remote workspace API base URL after validating remote options.
 */
export function remoteWorkspaceUrl(options: LoadRemoteMonospaceSchemaOptions, what: string): string {
  const workspace = resolveMonospaceWorkspace(options)
  if (!options.url || !workspace) {
    throw new Error(`@rstore/monospace requires url and workspace options to load the remote Monospace ${what}`)
  }
  const url = options.url.endsWith('/') ? options.url.slice(0, -1) : options.url
  return `${url}/api/${encodeURIComponent(workspace)}`
}

/**
 * Fetches a remote schema resource as JSON with the schema API key.
 *
 * Throws `Failed to load Monospace {what}: {status}{hint}` on HTTP errors,
 * without parsing non-JSON error bodies.
 */
export async function fetchRemoteSchemaJson(
  options: LoadRemoteMonospaceSchemaOptions,
  url: string,
  what: string,
  hint = '',
): Promise<unknown> {
  const fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis)
  const response = await fetchFn(url, {
    headers: options.schemaApiKey ? { Authorization: `Bearer ${options.schemaApiKey}` } : {},
  })
  if (!response.ok) {
    throw new Error(`Failed to load Monospace ${what}: ${response.status}${hint}`)
  }
  return await response.json() as unknown
}
