import type { ViteDevServer } from 'vite'
import process from 'node:process'
import { createServer } from 'vite'
import { runtimeSourceAliases, sourceEntry } from '../../../../test/utils/sourceAliases'

/** Load shipped Nuxt plugin with generated app inputs and its browser branch enabled. */
export async function loadClientPlugin(failConstruction = false) {
  const generated: Record<string, string> = {
    '#rstore-collection': 'export default [{ name: "todos" }]',
    '#rstore-devtools': 'export default { base: "/inspect/", readOnly: true }',
    '#rstore-options': 'export default { syncImmediately: false, tombstoneGc: false }',
    '#rstore-plugins': failConstruction
      ? 'export const startup = { name: "application-init", setup() { throw new Error("Application initialization failed") } }'
      : 'export {}',
  }
  const server: ViteDevServer = await createServer({
    configFile: false,
    cacheDir: `/tmp/rstore-nuxt-startup-${process.pid}`,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, watch: null },
    define: { 'import.meta.server': 'true', 'import.meta.client': 'false', 'import.meta.dev': 'false', '__NUXT_ASYNC_CONTEXT__': 'false', '__NUXT_VERSION__': '"test"' },
    resolve: {
      alias: [
        ...Object.entries(runtimeSourceAliases).map(([find, replacement]) => ({ find: new RegExp(`^${find}$`), replacement })),
        { find: '#imports', replacement: sourceEntry('nuxt-directus', 'node_modules/nuxt/dist/app/nuxt.js') },
        { find: '#build/nuxt.config.mjs', replacement: sourceEntry('nuxt-multiplayer', 'test/fixtures/nuxtRuntimeConfig.ts') },
      ],
    },
    plugins: [{
      name: 'nuxt-generated-client-inputs',
      enforce: 'pre',
      resolveId: id => id in generated ? `\0${id}` : undefined,
      load: id => generated[id.slice(1)],
      transform(code, id) {
        if (id === sourceEntry('nuxt', 'src/runtime/plugin.ts')) {
          return code.replaceAll('import.meta.client', 'true').replaceAll('import.meta.server', 'false').replaceAll('import.meta.dev', 'true')
        }
      },
    }],
  })
  try {
    return { server, plugin: (await server.ssrLoadModule(sourceEntry('nuxt', 'src/runtime/plugin.ts'))).default }
  }
  catch (error) {
    await server.close()
    throw error
  }
}
