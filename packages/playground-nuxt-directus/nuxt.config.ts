export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    // '@rstore/nuxt-drizzle',
    '../nuxt-directus/src',
    '@vueuse/nuxt',
  ],
  devtools: { enabled: true },
  compatibilityDate: '2024-12-19',
  future: {
    compatibilityVersion: 4,
  },
  css: ['~/assets/style.css'],
  rstoreDirectus: {
    url: import.meta.env.DIRECTUS_URL,
    adminToken: import.meta.env.DIRECTUS_TOKEN,
  },
})
