import type { CreateStoreOptions } from '@rstore/vue'
import fs from 'node:fs'
import { addImports, addPlugin, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, resolveFiles } from '@nuxt/kit'
import serialize from 'serialize-javascript'
import { setupDevToolsUI } from './devtools'

declare module '@nuxt/schema' {
  export interface NuxtConfig {
    rstore?: ModuleOptions
  }

  export interface NuxtOptions {
    rstore?: ModuleOptions
    _rstoreCollectionImports?: Set<string>
    _rstorePluginImports?: Set<string>
  }
}

declare module 'nuxt/schema' {
  export interface NuxtConfig {
    rstore?: ModuleOptions
  }

  export interface NuxtOptions {
    rstore?: ModuleOptions
    _rstoreCollectionImports?: Set<string>
    _rstorePluginImports?: Set<string>
  }
}

// Module options TypeScript interface definition
export interface ModuleStoreOptions extends Pick<
  CreateStoreOptions,
  'collectionDefaults' | 'findDefaults' | 'syncImmediately' | 'experimentalGarbageCollection' | 'cacheStaggering'
> {}

export interface ModuleOptions {
  /**
   * Directories to scan for store files
   *
   * @default `['rstore']`
   */
  rstoreDirs?: string[]

  /**
   * Options passed directly to `createStore()`.
   */
  store?: ModuleStoreOptions

  /**
   * @deprecated Use `store.experimentalGarbageCollection` instead.
   */
  experimentalGarbageCollection?: boolean
}

export function resolveStoreOptions(options: ModuleOptions): ModuleStoreOptions {
  const storeOptions: ModuleStoreOptions = {
    ...options.store,
  }

  const experimentalGarbageCollection = options.store?.experimentalGarbageCollection
    ?? options.experimentalGarbageCollection

  if (experimentalGarbageCollection !== undefined) {
    storeOptions.experimentalGarbageCollection = experimentalGarbageCollection
  }

  return storeOptions
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'rstore',
    configKey: 'rstore',
  },
  // Default configuration options of the Nuxt module
  defaults: {},
  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const { resolve } = resolver

    // Auto imports
    const importsFile = resolve('./runtime/imports')
    addImports([
      'withItemType',
      'defineCollection',
      'defineRstorePlugin',
      'defineRstoreModule',
      'createRstoreModule',
      'useStore',
      'RStoreSchema',
    ].map(name => ({ from: importsFile, name })))
    addImports([
      'StoreRawCollections',
      'Store',
      'StoreResolvedCollectionItem',
      'StoreWrappedItem',
      'StoreCreateFormObject',
      'StoreUpdateFormObject',
    ].map(name => ({ from: importsFile, name, type: true })))

    // Scan folders
    const rstoreCollectionDirs: string[] = []
    const rstorePluginDirs: string[] = []

    for (const layer of nuxt.options._layers) {
      const layerRstoreDirs = (layer.config as unknown as { rstore: ModuleOptions } | null)?.rstore?.rstoreDirs ?? ['rstore']
      for (const dir of layerRstoreDirs) {
        const layerDir = resolve(layer.config.srcDir, dir)
        rstoreCollectionDirs.push(layerDir)
        const layerPluginDir = resolve(layer.config.srcDir, dir, 'plugins')
        rstorePluginDirs.push(layerPluginDir)
      }
    }

    async function resolveCollectionFiles() {
      let files = (await Promise.all(rstoreCollectionDirs.map((dir) => {
        return resolveFiles(dir, ['./*{.ts,.js}'])
      }))).flat()
      files = files.map((file) => {
        const content = fs.readFileSync(file, 'utf-8')
        // Find `export default` statements
        const doesExportDefault = /export default/.test(content)
        const doesExportConst = /export const /.test(content)
        if (!doesExportDefault && !doesExportConst) {
          if (!doesExportDefault) {
            console.warn(`No exported default found in ${file}`)
          }
          if (!doesExportConst) {
            console.warn(`No exported const found in ${file}`)
          }
          return null
        }
        return file
      }).filter(Boolean) as string[]
      files.push(...nuxt.options._rstoreCollectionImports ?? [])
      return files
    }

    async function resolvePluginFiles() {
      const files = (await Promise.all(rstorePluginDirs.map((dir) => {
        return resolveFiles(dir, ['./*{.ts,.js}'])
      }))).flat()
      files.push(...nuxt.options._rstorePluginImports ?? [])
      return files
    }

    const optionsTemplate = addTemplate({
      filename: '$rstore-options.ts',
      getContents: () => `export default ${serialize(resolveStoreOptions(options))}`,
      write: true,
    })

    const collectionTemplate = addTemplate({
      filename: '$rstore-collection.ts',
      getContents: async () => {
        const files = await resolveCollectionFiles()
        return `import type { StoreSchema } from '@rstore/shared'
${files.map((file, index) => `import * as M${index} from '${file.replace('.ts', '')}'`).join('\n')}
export default [
  ${files.map((file, index) => `...Object.values(M${index}),`).join('\n')}
] satisfies StoreSchema`
      },
      write: true,
    })

    const pluginsTemplate = addTemplate({
      filename: '$rstore-plugins.ts',
      getContents: async () => {
        const files = await resolvePluginFiles()
        return files.map((file, index) => `export { default as Plugin_${index} } from '${file}'`).join('\n')
      },
    })

    nuxt.options.alias['#rstore-options'] = optionsTemplate.dst
    nuxt.options.alias['#rstore-collection'] = collectionTemplate.dst
    nuxt.options.alias['#rstore-plugins'] = pluginsTemplate.dst

    addTypeTemplate({
      filename: 'types/rstore.d.ts',
      getContents: () => `import type { Store } from '#imports'
declare module '@rstore/vue' {
  export function useStore(): Store
}
  
export {}`,
    })

    addPlugin(resolve('./runtime/plugin'))

    setupDevToolsUI(nuxt, resolver)
  },
})
