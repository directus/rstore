import process from 'node:process'
import { resolve } from 'pathe'

export default defineNuxtConfig({
  ssr: false,

  modules: [
    '@nuxt/ui',
    '@vueuse/nuxt',
  ],

  nitro: {
    output: {
      publicDir: resolve(__dirname, '../dist/client'),
    },
  },

  app: {
    baseURL: '/__rstore',
  },

  vite: {
    server: {
      hmr: {
        // Instead of go through proxy, we directly connect real port of the client app
        clientPort: +(process.env.PORT || 3300),
      },
    },
  },

  dir: {
    public: resolve(__dirname, 'public'),
  },

  css: [
    '~/assets/style.css',
  ],

  devtools: {
    enabled: false,
  },

  compatibilityDate: '2024-08-21',
})
