import process from 'node:process'

export default defineNuxtConfig({
  devtools: { enabled: true },
  compatibilityDate: '2025-02-10',
  future: {
    compatibilityVersion: 4,
  },

  modules: [
    '../nuxt/src/module',
    '../nuxt-multiplayer/src/module',
    '@nuxt/ui',
    '@vueuse/nuxt',
    'nuxt-auth-utils',

  ],

  css: [
    '~/assets/style.css',
  ],

  nitro: {
    experimental: {
      websocket: true,
    },
  },

  runtimeConfig: {
    public: {
      wsEndpoint: process.env.WS_ENDPOINT || '/_ws',
    },
  },

  experimental: {
    asyncContext: true,
  },

  rstore: {
    store: {
      experimentalGarbageCollection: true,
    },
  },
})
