import { resolve } from 'node:path'
import { startSubprocess } from '@nuxt/devtools-kit'
import { defineNuxtModule } from 'nuxt/kit'

export default defineNuxtConfig({
  devtools: { enabled: true },
  compatibilityDate: '2025-02-10',
  future: {
    compatibilityVersion: 4,
  },

  modules: [
    '../nuxt/src/module',
    '@nuxt/ui',
    '@vueuse/nuxt',

    /**
     * Start a sub Nuxt Server for developing the client
     *
     * The terminal output can be found in the Terminals tab of the devtools.
     */
    defineNuxtModule({
      setup(_, nuxt) {
        if (!nuxt.options.dev) {
          return
        }

        const _process = startSubprocess(
          {
            command: 'npx',
            args: ['nuxi', 'dev', '--port', '3300'],
            cwd: resolve(__dirname, '../nuxt/client'),
          },
          {
            id: 'rstore:client',
            name: 'rstore Client Dev',
          },
        )
      },
    }),
  ],

  css: [
    '~/assets/style.css',
  ],

  nitro: {
    experimental: {
      websocket: true,
    },
  },
})
