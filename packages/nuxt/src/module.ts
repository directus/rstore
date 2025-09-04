import fs from 'node:fs'
import { addImports, addPlugin, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, resolveFiles } from '@nuxt/kit'
import { setupDevToolsUI } from './devtools'

declare module '@nuxt/schema' {
  export interface NuxtOptions {
    _rstoreModelImports?: Set<string>
    _rstorePluginImports?: Set<string>
  }
}

// Module options TypeScript interface definition
export interface ModuleOptions {
  /**
   * Directories to scan for store files
   *
   * @default `['rstore']`
   */
  rstoreDirs?: string[]

  /**
   * Experimental: Enable garbage collection for items that are not referenced by any query or other item.
   */
  experimentalGarbageCollection?: boolean
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
      'defineItemType',
      'defineDataModel',
      'defineRstorePlugin',
      'defineRstoreModule',
      'createRstoreModule',
      'useStore',
      'RStoreSchema',
    ].map(name => ({ from: importsFile, name })))
    addImports([
      'StoreRawModels',
      'Store',
      'StoreResolvedModelItem',
      'StoreWrappedItem',
      'StoreCreateFormObject',
      'StoreUpdateFormObject',
    ].map(name => ({ from: importsFile, name, type: true })))

    // Scan folders
    const rstoreModelDirs: string[] = []
    const rstorePluginDirs: string[] = []

    for (const layer of nuxt.options._layers) {
      const layerRstoreDirs = (layer.config as unknown as { rstore: ModuleOptions } | null)?.rstore?.rstoreDirs ?? ['rstore']
      for (const dir of layerRstoreDirs) {
        const layerDir = resolve(layer.config.srcDir, dir)
        rstoreModelDirs.push(layerDir)
        const layerPluginDir = resolve(layer.config.srcDir, dir, 'plugins')
        rstorePluginDirs.push(layerPluginDir)
      }
    }

    async function resolveModelFiles() {
      let files = (await Promise.all(rstoreModelDirs.map((dir) => {
        return resolveFiles(dir, ['./*{.ts,.js}'])
      }))).flat()
      files = files.map((file) => {
        const content = fs.readFileSync(file, 'utf-8')
        // Find `export default` statements
        if (!/export default/.test(content)) {
          console.warn(`No exported default found in ${file}`)
          return null
        }
        return file
      }).filter(Boolean) as string[]
      files.push(...nuxt.options._rstoreModelImports ?? [])
      return files
    }

    async function resolvePluginFiles() {
      const files = (await Promise.all(rstorePluginDirs.map((dir) => {
        return resolveFiles(dir, ['./*{.ts,.js}'])
      }))).flat()
      files.push(...nuxt.options._rstorePluginImports ?? [])
      return files
    }

    addTemplate({
      filename: '$restore-options.ts',
      getContents: () => `export default ${JSON.stringify({ experimentalGarbageCollection: options.experimentalGarbageCollection || false })}`,
    })

    addTemplate({
      filename: '$rstore-model.ts',
      getContents: async () => {
        const files = await resolveModelFiles()
        return `${files.map((file, index) => `import M${index} from '${file}'`).join('\n')}
export default [
  ${files.map((file, index) => `...Array.isArray(M${index}) ? M${index} : [M${index}],`).join('\n')}
]`
      },
    })

    addTypeTemplate({
      filename: '$rstore-model-const.d.ts',
      getContents: async () => {
        const files = await resolveModelFiles()
        return `import type { StoreSchema } from '@rstore/shared'
${files.map((file, index) => `import M${index} from '${file}'`).join('\n')}
type EnsureArray<T> = T extends any[] ? T : [T]
function ensureArray<T>(value: T): EnsureArray<T> {
  return Array.isArray(value) ? value : [value]
}
export const constModels = [
  ${files.map((file, index) => `...ensureArray(M${index}),`).join('\n')}
] satisfies StoreSchema`
      },
    })

    addTemplate({
      filename: '$rstore-plugins.ts',
      getContents: async () => {
        const files = await resolvePluginFiles()
        return files.map((file, index) => `export { default as Plugin_${index} } from '${file}'`).join('\n')
      },
    })

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
