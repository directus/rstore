import fs from 'node:fs'
import { addImports, addPlugin, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, resolveFiles } from '@nuxt/kit'
import { setupDevToolsUI } from './devtools'

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
      'defineModelType',
      'defineRstorePlugin',
      'useStore',
    ].map(name => ({ from: importsFile, name })))

    // Scan folder
    if (!options.rstoreDirs) {
      // resolve it against the src dir which is the root by default
      options.rstoreDirs = [resolve(nuxt.options.srcDir, 'rstore')]
    }

    const rstoreDirs = options.rstoreDirs as string[]
    const rstorePluginDirs = rstoreDirs.map(dir => resolve(dir, 'plugins'))

    addTemplate({
      filename: '$rstore-model.ts',
      getContents: async () => {
        const files = (await Promise.all(rstoreDirs.map((dir) => {
          return resolveFiles(dir, ['./*{.ts,.js}'])
        }))).flat()
        return files.map(file => `export * from '${file}'`).join('\n')
      },
    })

    addTypeTemplate({
      filename: '$rstore-model-const.d.ts',
      getContents: async () => {
        const files = (await Promise.all(rstoreDirs.map((dir) => {
          return resolveFiles(dir, ['./*{.ts,.js}'])
        }))).flat()
        const data = files.map((file) => {
          const content = fs.readFileSync(file, 'utf-8')
          // Find all `export const` statements
          const matches = content.match(/export const (\w+)/g)
          if (!matches) {
            console.warn(`No exported constants found in ${file}`)
            return null
          }
          return {
            file,
            exported: matches.map(match => match.split(' ')[2]),
          }
        }).filter(Boolean) as { file: string, exported: string[] }[]
        return `import type { Model } from '@rstore/shared'
${data.map(({ file, exported }) => `import { ${exported.join(', ')} } from '${file}'`).join('\n')}
export const constModel = {
  ${data.map(({ exported }) => exported.map(name => `${name},`).join('\n')).join('\n')}
} as const satisfies Model`
      },
    })

    addTemplate({
      filename: '$rstore-plugins.ts',
      getContents: async () => {
        const files = (await Promise.all(rstorePluginDirs.map((dir) => {
          return resolveFiles(dir, ['./*{.ts,.js}'])
        }))).flat()
        return files.map((file, index) => `export { default as Plugin_${index} } from '${file}'`).join('\n')
      },
    })

    // Do not add the extension since the `.ts` will be transpiled to `.mjs` after `npm run prepack`
    addPlugin(resolve('./runtime/plugin'))

    setupDevToolsUI(nuxt, resolver)
  },
})
