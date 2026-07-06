import type { MonospaceCollectionDefinition, MonospacePrimaryKeyConfig } from '@rstore/monospace/schema'
import type { Plugin, ResolvedConfig } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import process from 'node:process'
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
const RESOLVED_PREFIX = '\0'

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
  let config: ResolvedConfig | undefined
  let collectionsPromise: Promise<MonospaceCollectionDefinition[]> | undefined

  return {
    name: 'rstore-vite-monospace',

    configResolved(resolvedConfig) {
      config = resolvedConfig
    },

    configureServer(server) {
      const inputs = resolveLocalInputPaths(config, options)
      if (!inputs.length) {
        return
      }

      // Regenerate the virtual modules when a local schema file changes.
      for (const input of inputs) {
        server.watcher.add(input)
      }
      server.watcher.on('change', (file) => {
        if (!inputs.includes(file)) {
          return
        }

        collectionsPromise = undefined
        for (const id of [VIRTUAL_MODULE_ID, VIRTUAL_SCHEMA_ID, VIRTUAL_PLUGIN_ID]) {
          const module = server.moduleGraph.getModuleById(`${RESOLVED_PREFIX}${id}`)
          if (module) {
            server.moduleGraph.invalidateModule(module)
          }
        }
        server.ws.send({ type: 'full-reload' })
      })
    },

    resolveId(id) {
      if (isVirtualModuleId(id)) {
        return `${RESOLVED_PREFIX}${id}`
      }
    },

    async buildStart() {
      for (const input of resolveLocalInputPaths(config, options)) {
        this.addWatchFile(input)
      }
      await getCollections()
    },

    watchChange(id) {
      // Reload the local schema files on the next rebuild in watch mode.
      if (resolveLocalInputPaths(config, options).includes(id)) {
        collectionsPromise = undefined
      }
    },

    async load(id) {
      const virtualId = unwrapVirtualModuleId(id)
      if (!virtualId) {
        return
      }

      const collections = await getCollections()
      const scopeId = options.scopeId ?? DEFAULT_MONOSPACE_SCOPE_ID

      switch (virtualId) {
        case VIRTUAL_MODULE_ID:
          return generateViteIndexTemplate()
        case VIRTUAL_SCHEMA_ID:
          return generateViteSchemaTemplate(collections)
        case VIRTUAL_PLUGIN_ID:
          assertRuntimeOptions(options)
          return generateMonospacePluginTemplate({
            apiKey: options.runtimeApiKey,
            project: options.project!,
            scopeId,
            url: options.url!,
          })
      }
    },
  }

  /**
   * Loads Monospace collections once per plugin instance.
   */
  async function getCollections(): Promise<MonospaceCollectionDefinition[]> {
    collectionsPromise ??= loadCollections(config, options).then(async (collections) => {
      await writeDeclarationFile(config, options, collections)
      return collections
    })
    return collectionsPromise
  }
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
 * Writes generated virtual-module declarations when enabled.
 */
async function writeDeclarationFile(
  config: ResolvedConfig | undefined,
  options: RstoreMonospaceViteOptions,
  collections: MonospaceCollectionDefinition[],
): Promise<void> {
  if (options.dts === false) {
    return
  }

  const dtsPath = resolveDeclarationPath(config, options.dts)
  await mkdir(dirname(dtsPath), { recursive: true })
  await writeFile(dtsPath, generateViteDeclarations(collections))
}

/**
 * Resolves the declaration file output path.
 */
function resolveDeclarationPath(
  config: ResolvedConfig | undefined,
  dts: RstoreMonospaceViteOptions['dts'],
): string {
  const root = config?.root ?? process.cwd()
  const path = typeof dts === 'string' ? dts : 'rstore-monospace.d.ts'
  return isAbsolute(path) ? path : resolve(root, path)
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

/**
 * Returns whether an id is one of the public Monospace virtual modules.
 */
function isVirtualModuleId(id: string): boolean {
  return id === VIRTUAL_MODULE_ID
    || id === VIRTUAL_SCHEMA_ID
    || id === VIRTUAL_PLUGIN_ID
}

/**
 * Converts a resolved virtual id back to its public module id.
 */
function unwrapVirtualModuleId(id: string): string | null {
  const virtualId = id.startsWith(RESOLVED_PREFIX) ? id.slice(RESOLVED_PREFIX.length) : id
  return isVirtualModuleId(virtualId) ? virtualId : null
}
