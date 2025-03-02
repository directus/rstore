import { createResolver } from 'nuxt/kit'

const { resolve } = createResolver(import.meta.url)

export default defineNuxtConfig({
  devtools: { enabled: true },
  compatibilityDate: '2025-02-10',
  future: {
    compatibilityVersion: 4,
  },

  modules: [
    '../src/module',
    '@nuxt/ui',
    '@vueuse/nuxt',
  ],

  myModule: {},

  css: [
    '~/assets/style.css',
  ],

  dir: {
    public: resolve('public'),
  },
})
