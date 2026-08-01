import type { DirectusCollectionDefinition } from '@rstore/directus/schema'
import type { Plugin } from 'vite'
import { createRstoreVirtualModulePlugin } from '@rstore/connector-toolkit/vite'
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
  const scopeId = options.scopeId ?? DEFAULT_DIRECTUS_SCOPE_ID

  return createRstoreVirtualModulePlugin<DirectusCollectionDefinition>({
    name: 'rstore-vite-directus',
    virtualIds: {
      index: VIRTUAL_MODULE_ID,
      schema: VIRTUAL_SCHEMA_ID,
      plugin: VIRTUAL_PLUGIN_ID,
    },
    loadCollections: () => loadCollections(options),
    generateIndex: () => generateViteIndexTemplate(),
    generateSchema: collections => generateViteSchemaTemplate(collections),
    generatePlugin: () => generateDirectusPluginTemplate({
      url: options.url!,
      scopeId,
    }),
    generateDeclarations: collections => generateViteDeclarations(collections),
    dts: options.dts,
    defaultDtsFileName: 'rstore-directus.d.ts',
  })
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
