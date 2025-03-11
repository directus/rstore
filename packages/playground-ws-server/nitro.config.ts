// https://nitro.unjs.io/config
export default defineNitroConfig({
  compatibilityDate: '2025-03-11',

  srcDir: 'server',

  experimental: {
    websocket: true,
  },

  preset: 'cloudflare-durable',
})
