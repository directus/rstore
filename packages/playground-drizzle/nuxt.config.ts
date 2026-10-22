import { createResolver } from 'nuxt/kit'

const { resolve } = createResolver(import.meta.url)

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    // '@rstore/nuxt-drizzle',
    '../nuxt/src',
    '../nuxt-drizzle/src',
    '@vueuse/nuxt',
  ],
  devtools: { enabled: true },
  compatibilityDate: '2025-09-01',
  runtimeConfig: {
    dbUrl: `file:${resolve('.db.sqlite')}`,
  },
  css: ['~/assets/style.css'],
  rstoreDrizzle: {
    ws: true,
    offline: true,
  },
})
