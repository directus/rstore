import type { Plugin } from 'vite'
import { transformWithOxc } from 'vite'

/** Build constants consumed by the actual installed Nuxt client runtime. */
export const multiplayerNuxtDefines = {
  'import.meta.client': 'true',
  'import.meta.server': 'false',
  'import.meta.dev': 'false',
  '__NUXT_ASYNC_CONTEXT__': 'false',
  '__NUXT_VERSION__': JSON.stringify('browser-test'),
}

/**
 * Vite's dev define pass skips node_modules. Compile Nuxt's shipped runtime
 * with its normal client constants; runtime exports and behavior stay real.
 */
export function multiplayerNuxtRuntime(): Plugin {
  return {
    name: 'rstore-multiplayer-nuxt-runtime',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.replaceAll('\\', '/').includes('/node_modules/nuxt/dist/app/'))
        return
      return transformWithOxc(code, id, { lang: 'js', target: 'esnext', define: multiplayerNuxtDefines })
    },
  }
}
