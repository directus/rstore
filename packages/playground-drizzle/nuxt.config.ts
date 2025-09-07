import { startSubprocess } from '@nuxt/devtools-kit'
import { createResolver, defineNuxtModule } from 'nuxt/kit'

const { resolve } = createResolver(import.meta.url)

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    // '@rstore/nuxt-drizzle',
    '../nuxt/src',
    '../nuxt-drizzle/src',
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
  devtools: { enabled: true },
  compatibilityDate: '2025-09-01',
  runtimeConfig: {
    dbUrl: `file:${resolve('.db.sqlite')}`,
  },
  css: ['~/assets/style.css'],
})
