const isolationHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

export default defineNuxtConfig({
  modules: [],
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
