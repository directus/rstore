export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    // '@rstore/nuxt-drizzle',
    '../nuxt-directus/src',
    '@vueuse/nuxt',
  ],
  devtools: { enabled: true },
  compatibilityDate: '2025-09-01',
  css: ['~/assets/style.css'],
  rstoreDirectus: {
    url: import.meta.env.DIRECTUS_URL,
    adminToken: import.meta.env.DIRECTUS_TOKEN,
  },
})
