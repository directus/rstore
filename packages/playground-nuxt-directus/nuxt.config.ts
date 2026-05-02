import process from 'node:process'

const directusURL = process.env.DIRECTUS_URL ?? 'http://127.0.0.1:8056'
const directusToken = process.env.DIRECTUS_TOKEN ?? 'rstore-directus-e2e-token'

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '../nuxt-directus/src',
    '@vueuse/nuxt',
  ],
  devtools: { enabled: true },
  compatibilityDate: '2025-09-01',
  css: ['~/assets/style.css'],
  rstoreDirectus: {
    url: directusURL,
    adminToken: directusToken,
  },
})
