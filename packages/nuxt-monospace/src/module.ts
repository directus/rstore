import type { CreateMonospaceRestClientOptions, MonospaceWorkspaceOptions } from '@rstore/monospace'
import type { MonospacePrimaryKeyConfig } from '@rstore/monospace/schema'
import { resolve } from 'node:path'
import { addImportsDir, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, useLogger } from '@nuxt/kit'
import { DEFAULT_MONOSPACE_SCOPE_ID, resolveMonospaceWorkspace } from '@rstore/monospace'
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
export interface ModuleOptions extends MonospaceWorkspaceOptions {
  /**
   * Monospace API URL.
   */
  url?: string

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
   * Local schema metadata snapshot JSON file path, as returned by
   * `loadRemoteSchemaMetadata` from `@rstore/monospace/schema`. Required
   * alongside `input` for fully local generation.
   */
  metadataInput?: string

  /**
   * Runtime API key emitted into generated client code.
   */
  runtimeApiKey?: string

  /**
   * `Cache-Control` request header sent by the generated runtime client.
   * `'no-cache'` bypasses the Monospace server-side read cache. Not sent by
   * default.
   */
  cacheControl?: CreateMonospaceRestClientOptions['cacheControl']

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

    const workspace = resolveMonospaceWorkspace(options)
    if (!options.url || !workspace) {
      log.warn('Monospace URL and workspace are required; skipping Monospace collection generation')
      return
    }

    const scopeId = options.scopeId ?? DEFAULT_MONOSPACE_SCOPE_ID
    const collections = await loadMonospaceCollections({
      input: options.input ? resolve(nuxt.options.rootDir, options.input) : undefined,
      metadataInput: options.metadataInput ? resolve(nuxt.options.rootDir, options.metadataInput) : undefined,
      primaryKeys: options.primaryKeys,
      workspace,
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
        cacheControl: options.cacheControl,
        scopeId,
        url: options.url!,
        workspace,
      }),
    })

    const { addCollectionImport, addPluginImport } = await import('@rstore/nuxt/api')

    addCollectionImport(nuxt, '#build/$rstore-monospace-collections.js')
    addPluginImport(nuxt, resolveModulePath('./runtime/plugin'))
  },
})
