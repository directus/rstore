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
      publicDir: resolve(__dirname, 'dist/client'),
    },
  },

  app: {
    baseURL: '/__rstore',
  },

  vite: {
    server: {
      hmr: {
        clientPort: +(process.env.PORT || 3300),
      },
    },
  },

  css: [
    resolve(__dirname, 'app/assets/style.css'),
  ],

  devtools: {
    enabled: false,
  },

  compatibilityDate: '2024-08-21',
})
