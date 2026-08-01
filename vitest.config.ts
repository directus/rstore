import { configDefaults, defineConfig } from 'vitest/config'

/**
 * The three tests that boot a full Nuxt app via `@nuxt/test-utils/e2e` —
 * minute-scale each, so they get their own serialized project below.
 */
const nuxtBootTests = [
  'packages/nuxt-directus/test/basic.test.ts',
  'packages/nuxt-drizzle/test/basic.test.ts',
  'packages/nuxt-monospace/test/basic.test.ts',
]

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'test/**/*.{test,spec}.ts',
            'packages/*/test/**/*.{test,spec}.ts',
          ],
          exclude: [
            ...configDefaults.exclude,
            '**/e2e/**',
            'packages/nuxt*/**',
            'packages/playground*/**',
          ],
        },
      },
      {
        test: {
          name: 'nuxt',
          include: ['packages/nuxt*/test/**/*.{test,spec}.ts'],
          exclude: [
            ...configDefaults.exclude,
            '**/e2e/**',
            '**/fixtures/**',
            ...nuxtBootTests,
          ],
        },
      },
      {
        test: {
          name: 'nuxt-boot',
          include: nuxtBootTests,
          // Nuxt build + start per file: generous timeouts, and a single fork
          // so the three memory-heavy builds don't race each other.
          testTimeout: 120_000,
          hookTimeout: 300_000,
          pool: 'forks',
          poolOptions: {
            forks: { singleFork: true },
          },
        },
      },
    ],
  },
})
