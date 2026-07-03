import type { MonospacePrimaryKeyConfig } from '@rstore/monospace/schema'
import { resolve } from 'node:path'
import { addImportsDir, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, useLogger } from '@nuxt/kit'
import { DEFAULT_MONOSPACE_SCOPE_ID } from '@rstore/monospace'
import {
  generateCollectionsTemplate,
  generateConfigTemplate,
  generateItemsTemplate,
  generateTypedCollectionsTemplate,
  loadMonospaceCollections,
} from '@rstore/monospace/schema'

/**
 * Options accepted by the rstore Monospace Nuxt module.
 */
export interface ModuleOptions {
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
   *
   * @default 'rstore-monospace'
   */
  scopeId?: string

  /**
   * Explicit primary key overrides keyed by collection name.
   */
  primaryKeys?: MonospacePrimaryKeyConfig
}

declare module '@nuxt/schema' {
  export interface NuxtConfig {
    /**
     * rstore Monospace module options.
     */
    rstoreMonospace?: ModuleOptions
  }

  export interface NuxtOptions {
    /**
     * Resolved rstore Monospace module options.
     */
    rstoreMonospace?: ModuleOptions
  }
}

declare module 'nuxt/schema' {
  export interface NuxtConfig {
    /**
     * rstore Monospace module options.
     */
    rstoreMonospace?: ModuleOptions
  }

  export interface NuxtOptions {
    /**
     * Resolved rstore Monospace module options.
     */
    rstoreMonospace?: ModuleOptions
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'rstore-monospace',
    configKey: 'rstoreMonospace',
    compatibility: {
      nuxt: '^3.19.2 || >=4.1.2',
    },
  },
  moduleDependencies: {
    '@rstore/nuxt': {},
  },
  async setup(options, nuxt) {
    const log = useLogger('rstore-monospace')
    const { resolve: resolveModulePath } = createResolver(import.meta.url)

    nuxt.hook('prepare:types', ({ references }) => {
      references.push({ path: resolveModulePath('./runtime/types.ts') })
    })

    if (!options.url || !options.project) {
      log.warn('Monospace URL and project are required; skipping Monospace collection generation')
      return
    }

    const scopeId = options.scopeId ?? DEFAULT_MONOSPACE_SCOPE_ID
    const collections = await loadMonospaceCollections({
      input: options.input ? resolve(nuxt.options.rootDir, options.input) : undefined,
      primaryKeys: options.primaryKeys,
      project: options.project,
      schemaApiKey: options.schemaApiKey,
      scopeId,
      url: options.url,
    })

    addTemplate({
      filename: '$rstore-monospace-collections.js',
      getContents: () => generateCollectionsTemplate(collections),
    })

    addTypeTemplate({
      filename: '$rstore-monospace-items.d.ts',
      getContents: () => generateItemsTemplate(collections),
    })

    addTypeTemplate({
      filename: '$rstore-monospace-collections.d.ts',
      getContents: () => generateTypedCollectionsTemplate(collections),
    })

    addImportsDir(resolveModulePath('./runtime/utils'))

    addTemplate({
      filename: '$rstore-monospace-config.js',
      getContents: () => generateConfigTemplate({
        apiKey: options.runtimeApiKey,
        project: options.project!,
        scopeId,
        url: options.url!,
      }),
    })

    const { addCollectionImport, addPluginImport } = await import('@rstore/nuxt/api')

    addCollectionImport(nuxt, '#build/$rstore-monospace-collections.js')
    addPluginImport(nuxt, resolveModulePath('./runtime/plugin'))
  },
})
