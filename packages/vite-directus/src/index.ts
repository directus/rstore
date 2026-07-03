import type { DirectusCollectionDefinition } from '@rstore/directus/schema'
import type { Plugin, ResolvedConfig } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import process from 'node:process'
import { DEFAULT_DIRECTUS_SCOPE_ID } from '@rstore/directus'
import {
  generateDirectusPluginTemplate,
  generateViteDeclarations,
  generateViteIndexTemplate,
  generateViteSchemaTemplate,
  loadDirectusCollections,
} from '@rstore/directus/schema'

const VIRTUAL_MODULE_ID = 'virtual:rstore-directus'
const VIRTUAL_SCHEMA_ID = 'virtual:rstore-directus/schema'
const VIRTUAL_PLUGIN_ID = 'virtual:rstore-directus/plugin'
const RESOLVED_PREFIX = '\0'

/**
 * Options accepted by the rstore Directus Vite plugin.
 */
export interface RstoreDirectusViteOptions {
  /**
   * Directus API URL.
   */
  url?: string

  /**
   * Admin token for build-time Directus introspection.
   */
  adminToken?: string

  /**
   * rstore plugin scope id for generated Directus collections.
   */
  scopeId?: string

  /**
   * Type declaration file path. Set to `false` to disable generation.
   *
   * @default 'rstore-directus.d.ts'
   */
  dts?: string | boolean
}

/**
 * Creates the Nuxt-free Vite plugin for generated rstore Directus modules.
 */
export function rstoreDirectus(options: RstoreDirectusViteOptions): Plugin {
  let config: ResolvedConfig | undefined
  let collectionsPromise: Promise<DirectusCollectionDefinition[]> | undefined

  return {
    name: 'rstore-vite-directus',

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
      const scopeId = options.scopeId ?? DEFAULT_DIRECTUS_SCOPE_ID

      switch (virtualId) {
        case VIRTUAL_MODULE_ID:
          return generateViteIndexTemplate()
        case VIRTUAL_SCHEMA_ID:
          return generateViteSchemaTemplate(collections)
        case VIRTUAL_PLUGIN_ID:
          return generateDirectusPluginTemplate({
            url: options.url!,
            scopeId,
          })
      }
    },
  }

  /**
   * Loads Directus collections once per plugin instance.
   */
  async function getCollections(): Promise<DirectusCollectionDefinition[]> {
    collectionsPromise ??= loadCollections(options).then(async (collections) => {
      await writeDeclarationFile(config, options, collections)
      return collections
    })
    return collectionsPromise
  }
}

/**
 * Loads Directus collections after validating required plugin options.
 */
async function loadCollections(options: RstoreDirectusViteOptions): Promise<DirectusCollectionDefinition[]> {
  const missing = [
    options.url ? null : 'url',
    options.adminToken ? null : 'adminToken',
  ].filter(Boolean)

  if (missing.length) {
    throw new Error(`@rstore/vite-directus requires ${missing.join(' and ')} option${missing.length === 1 ? '' : 's'}`)
  }

  return await loadDirectusCollections({
    url: options.url!,
    adminToken: options.adminToken!,
    scopeId: options.scopeId ?? DEFAULT_DIRECTUS_SCOPE_ID,
  })
}

/**
 * Writes generated virtual-module declarations when enabled.
 */
async function writeDeclarationFile(
  config: ResolvedConfig | undefined,
  options: RstoreDirectusViteOptions,
  collections: DirectusCollectionDefinition[],
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
  dts: RstoreDirectusViteOptions['dts'],
): string {
  const root = config?.root ?? process.cwd()
  const path = typeof dts === 'string' ? dts : 'rstore-directus.d.ts'
  return isAbsolute(path) ? path : resolve(root, path)
}

/**
 * Returns whether an id is one of the public Directus virtual modules.
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
