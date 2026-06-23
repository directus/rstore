import type { Nuxt } from '@nuxt/schema'
import type { ModuleOptions } from './types'
import { addTemplate } from '@nuxt/kit'

export type OfflineResolvedOptions = Exclude<ModuleOptions['offline'], boolean | undefined> | Record<string, never> | null

/** Register offline plugin templates and imports when offline support is enabled. */
export function setupOffline({
  options,
  nuxt,
  resolve,
  addPluginImport,
}: {
  options: ModuleOptions
  nuxt: Nuxt
  resolve: (path: string) => string
  addPluginImport: (nuxt: Nuxt, path: string) => void
}): OfflineResolvedOptions {
  const offlineOptions = typeof options.offline === 'object' ? options.offline : (options.offline ? {} : null)
  if (!offlineOptions) {
    return null
  }

  const pluginFile = 'rstore-drizzle-offline-plugin.ts'
  addTemplate({
    filename: pluginFile,
    write: true,
    getContents: () => {
      return `import { createOfflinePlugin } from '@rstore/offline'
export default createOfflinePlugin({
  filterCollections: ${offlineOptions.filterCollection ? offlineOptions.filterCollection.toString() : 'undefined'},
  ...${JSON.stringify({
    ...offlineOptions,
  }, null, 2)}
})`
    },
  })

  addPluginImport(nuxt, `#build/${pluginFile}`)
  addPluginImport(nuxt, resolve('./runtime/plugin-offline'))
  return offlineOptions
}
