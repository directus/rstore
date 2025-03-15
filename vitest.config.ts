import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      'packages/nuxt',
      'packages/nuxt-drizzle',
    ],
  },
})
