import type { MonospaceCollectionDefinition, MonospacePrimaryKeyConfig } from '@rstore/monospace/schema'
import type { Plugin, ResolvedConfig } from 'vite'
import { isAbsolute, resolve } from 'node:path'
import process from 'node:process'
import { createRstoreVirtualModulePlugin } from '@rstore/connector-toolkit/vite'
import { DEFAULT_MONOSPACE_SCOPE_ID } from '@rstore/monospace'
import {
  generateMonospacePluginTemplate,
  generateViteDeclarations,
  generateViteIndexTemplate,
  generateViteSchemaTemplate,
  loadMonospaceCollections,
} from '@rstore/monospace/schema'

const VIRTUAL_MODULE_ID = 'virtual:rstore-monospace'
const VIRTUAL_SCHEMA_ID = 'virtual:rstore-monospace/schema'
const VIRTUAL_PLUGIN_ID = 'virtual:rstore-monospace/plugin'

/**
 * Options accepted by the rstore Monospace Vite plugin.
 */
export interface RstoreMonospaceViteOptions {
  /**
   * Monospace API URL.
   */
  url?: string

  /**
   * Monospace project identifier.
   */
  project?: string

  /**
   * Build-time API key for schema loading (OpenAPI document and schema
   * metadata queries). It needs the `openApiSchema:read` and
   * `dataModel:read` entitlements.
   */
  schemaApiKey?: string

  /**
   * Local OpenAPI JSON file path.
   */
  input?: string

  /**
   * Local schema metadata snapshot JSON file path: the raw items of the
   * Monospace system schema meta collections keyed by meta collection name.
   * Required alongside `input` for fully local generation.
   */
  metadataInput?: string

  /**
   * Runtime API key emitted into generated client code.
   */
  runtimeApiKey?: string

  /**
   * rstore plugin scope id for generated Monospace collections.
   */
  scopeId?: string

  /**
   * Explicit primary key overrides keyed by collection name.
   */
  primaryKeys?: MonospacePrimaryKeyConfig

  /**
   * Type declaration file path. Set to `false` to disable generation.
   *
   * @default 'rstore-monospace.d.ts'
   */
  dts?: string | boolean
}

/**
 * Creates the Nuxt-free Vite plugin for generated rstore Monospace modules.
 */
export function rstoreMonospace(options: RstoreMonospaceViteOptions): Plugin {
  const scopeId = options.scopeId ?? DEFAULT_MONOSPACE_SCOPE_ID

  return createRstoreVirtualModulePlugin<MonospaceCollectionDefinition>({
    name: 'rstore-vite-monospace',
    virtualIds: {
      index: VIRTUAL_MODULE_ID,
      schema: VIRTUAL_SCHEMA_ID,
      plugin: VIRTUAL_PLUGIN_ID,
    },
    loadCollections: ({ config }) => loadCollections(config, options),
    generateIndex: () => generateViteIndexTemplate(),
    generateSchema: collections => generateViteSchemaTemplate(collections),
    generatePlugin: () => {
      assertRuntimeOptions(options)
      return generateMonospacePluginTemplate({
        apiKey: options.runtimeApiKey,
        project: options.project!,
        scopeId,
        url: options.url!,
      })
    },
    generateDeclarations: collections => generateViteDeclarations(collections),
    dts: options.dts,
    defaultDtsFileName: 'rstore-monospace.d.ts',
    resolveWatchFiles: ({ config }) => resolveLocalInputPaths(config, options),
  })
}

/**
 * Loads Monospace collections after validating required plugin options.
 */
async function loadCollections(
  config: ResolvedConfig | undefined,
  options: RstoreMonospaceViteOptions,
): Promise<MonospaceCollectionDefinition[]> {
  const input = resolveInputPath(config, options.input)
  const metadataInput = resolveInputPath(config, options.metadataInput)
  assertSchemaSourceOptions(options, input, metadataInput)

  return await loadMonospaceCollections({
    input,
    metadataInput,
    primaryKeys: options.primaryKeys,
    project: options.project,
    schemaApiKey: options.schemaApiKey,
    scopeId: options.scopeId ?? DEFAULT_MONOSPACE_SCOPE_ID,
    url: options.url,
  })
}

/**
 * Asserts that every schema source can be loaded from the given options.
 *
 * Fully local generation needs both `input` (OpenAPI document) and
 * `metadataInput` (schema metadata snapshot); any missing local file falls
 * back to remote loading, which requires `url` and `project`.
 */
function assertSchemaSourceOptions(
  options: RstoreMonospaceViteOptions,
  input: string | undefined,
  metadataInput: string | undefined,
): void {
  if (input && metadataInput) {
    return
  }

  const missing = [
    options.url ? null : 'url',
    options.project ? null : 'project',
  ].filter(Boolean)

  if (missing.length) {
    const remoteSource = input ? 'schema metadata' : metadataInput ? 'OpenAPI schema' : 'schema'
    throw new Error(`@rstore/vite-monospace requires ${missing.join(' and ')} option${missing.length === 1 ? '' : 's'} to load the remote Monospace ${remoteSource}, or both input and metadataInput for local generation`)
  }
}

/**
 * Asserts that the generated runtime plugin has REST connection options.
 */
function assertRuntimeOptions(options: RstoreMonospaceViteOptions): void {
  const missing = [
    options.url ? null : 'url',
    options.project ? null : 'project',
  ].filter(Boolean)

  if (missing.length) {
    throw new Error(`@rstore/vite-monospace runtime plugin requires ${missing.join(' and ')} option${missing.length === 1 ? '' : 's'}`)
  }
}

/**
 * Resolves the configured local schema file paths.
 */
function resolveLocalInputPaths(
  config: ResolvedConfig | undefined,
  options: RstoreMonospaceViteOptions,
): string[] {
  return [
    resolveInputPath(config, options.input),
    resolveInputPath(config, options.metadataInput),
  ].filter((path): path is string => !!path)
}

/**
 * Resolves a local schema file path relative to the Vite project root.
 */
function resolveInputPath(
  config: ResolvedConfig | undefined,
  input: string | undefined,
): string | undefined {
  if (!input) {
    return undefined
  }

  return isAbsolute(input) ? input : resolve(config?.root ?? process.cwd(), input)
}
