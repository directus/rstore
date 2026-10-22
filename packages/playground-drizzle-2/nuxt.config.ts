export default defineNuxtConfig({
  devtools: { enabled: true },
  compatibilityDate: '2025-02-10',
  future: {
    compatibilityVersion: 4,
  },

  modules: [
    '@rstore/nuxt',
    '@rstore/nuxt-drizzle',
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@nuxthub/core',
  ],

  css: [
    '~/assets/style.css',
  ],

  hub: {
    database: true,
  },

  rstoreDrizzle: {
    drizzleImport: {
      name: 'useDrizzle',
      from: 'server/utils/db',
    },
  },
})
