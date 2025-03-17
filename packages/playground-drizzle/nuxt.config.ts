import { createResolver } from 'nuxt/kit'

const { resolve } = createResolver(import.meta.url)

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@rstore/nuxt-drizzle',
    '@vueuse/nuxt',
  ],
  devtools: { enabled: true },
  compatibilityDate: '2024-12-19',
  future: {
    compatibilityVersion: 4,
  },
  runtimeConfig: {
    dbUrl: `file:${resolve('.db.sqlite')}`,
  },
  css: ['~/assets/style.css'],
})
