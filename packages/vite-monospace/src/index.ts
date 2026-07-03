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
   * Build-time API key for OpenAPI schema loading.
   */
  schemaApiKey?: string

  /**
   * Local OpenAPI JSON file path.
   */
  input?: string

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

    resolveId(id) {
      if (isVirtualModuleId(id)) {
        return `${RESOLVED_PREFIX}${id}`
      }
    },

    async buildStart() {
      await getCollections()
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
  if (!input) {
    assertRemoteSchemaOptions(options)
  }

  return await loadMonospaceCollections({
    input,
    primaryKeys: options.primaryKeys,
    project: options.project,
    schemaApiKey: options.schemaApiKey,
    scopeId: options.scopeId ?? DEFAULT_MONOSPACE_SCOPE_ID,
    url: options.url,
  })
}

/**
 * Asserts that remote schema generation has the required connection options.
 */
function assertRemoteSchemaOptions(options: RstoreMonospaceViteOptions): void {
  const missing = [
    options.url ? null : 'url',
    options.project ? null : 'project',
  ].filter(Boolean)

  if (missing.length) {
    throw new Error(`@rstore/vite-monospace requires ${missing.join(' and ')} option${missing.length === 1 ? '' : 's'}`)
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
 * Resolves local OpenAPI input relative to the Vite project root.
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
