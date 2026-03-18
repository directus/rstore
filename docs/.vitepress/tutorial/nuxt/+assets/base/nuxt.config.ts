import { fileURLToPath, URL } from 'node:url'

const isolationHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

export default defineNuxtConfig({
  alias: {
    '#demo/backend': fileURLToPath(new URL('./src/tutorial/backend.ts', import.meta.url)),
    '#demo/events': fileURLToPath(new URL('./src/tutorial/liveEvents.ts', import.meta.url)),
    '#demo/runtime': fileURLToPath(new URL('./src/tutorial/runtime.ts', import.meta.url)),
  },
  modules: ['@rstore/nuxt'],
  css: ['~~/src/style.css'],
  ssr: false,
  devtools: {
    enabled: false,
  },
  nitro: {
    routeRules: {
      '/**': {
        headers: isolationHeaders,
      },
    },
  },
  vite: {
    server: {
      headers: isolationHeaders,
    },
  },
})
