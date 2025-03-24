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
      'useStore',
    ].map(name => ({ from: importsFile, name })))

    // Scan folder
    if (!options.rstoreDirs) {
      // resolve it against the src dir which is the root by default
      options.rstoreDirs = [resolve(nuxt.options.srcDir, 'rstore')]
    }

    const rstoreModelDirs = options.rstoreDirs as string[]
    const rstorePluginDirs = rstoreModelDirs.map(dir => resolve(dir, 'plugins'))

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
        return `import type { ModelList } from '@rstore/shared'
${files.map((file, index) => `import M${index} from '${file}'`).join('\n')}
type EnsureArray<T> = T extends any[] ? T : [T]
function ensureArray<T>(value: T): EnsureArray<T> {
  return Array.isArray(value) ? value : [value]
}
export const constModels = [
  ${files.map((file, index) => `...ensureArray(M${index}),`).join('\n')}
] satisfies ModelList`
      },
    })

    addTemplate({
      filename: '$rstore-plugins.ts',
      getContents: async () => {
        const files = await resolvePluginFiles()
        return files.map((file, index) => `export { default as Plugin_${index} } from '${file}'`).join('\n')
      },
    })

    addPlugin(resolve('./runtime/plugin'))

    setupDevToolsUI(nuxt, resolver)
  },
})
