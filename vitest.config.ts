import { readdirSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import { runtimeSourceAliases, sourceEntry } from './test/utils/sourceAliases'

/**
 * The three tests that boot a full Nuxt app via `@nuxt/test-utils/e2e` —
 * minute-scale each, so they get their own serialized project below.
 */
const nuxtBootTests = [
  'packages/nuxt-directus/test/basic.test.ts',
  'packages/nuxt-drizzle/test/basic.test.ts',
  'packages/nuxt-monospace/test/basic.test.ts',
]

/**
 * Integration suites live in `test/integration` folders and run in their own
 * project, so they are never collected twice by `unit` or `nuxt`.
 */
const integrationGlob = 'packages/*/test/integration/**/*.{test,spec}.ts'

/**
 * Unit and integration suites share package sources, not potentially stale
 * `dist` output. A public cross-package import must see the working tree.
 */
const sourceAliases = [
  ...Object.entries(runtimeSourceAliases).map(([name, replacement]) => ({
    find: new RegExp(`^${name}$`),
    replacement,
  })),
  // Exact matches keep the root alias from swallowing this public subpath.
  { find: /^@rstore\/connector-toolkit\/vite$/, replacement: sourceEntry('connector-toolkit', 'src/vite/index.ts') },
]

/**
 * The shared test helpers, reachable as `#test-utils/…` from any package.
 *
 * Available to both standalone form contracts and store integrations.
 * The matching `paths` entries live in `packages/{core,shared,vue}/tsconfig.json`
 * and in `tsconfig.integration.json`.
 */
const testUtilsAlias = [{
  find: '#test-utils',
  replacement: fileURLToPath(new URL('./test/utils', import.meta.url)),
}]

/** Exact sibling directories avoid overlapping names such as nuxt and nuxt-drizzle. */
const otherPackageExcludes = process.env.RSTORE_TEST_PACKAGE
  ? readdirSync(new URL('./packages', import.meta.url))
      .filter(name => name !== process.env.RSTORE_TEST_PACKAGE)
      .map(name => `packages/${name}/**`)
  : []

export default defineConfig({
  test: {
    // Inline projects inherit these exclusions. Unlike positional CLI filters,
    // this boundary still applies when a caller supplies another filename.
    exclude: process.env.RSTORE_TEST_PACKAGE
      ? ['test/**', ...otherPackageExcludes]
      : [],
    // Nuxt boot projects load separate app configurations and test-utils
    // instances. Sharing this root Vite server crosses those boundaries.
    sharedViteServer: false,
    /**
     * Coverage is measured for packages exercised in-process by unit and
     * integration suites. It is reported, not gated: a threshold added before
     * the expanded baseline is understood only blocks unrelated changes.
     *
     * Run every project at once (`pnpm test:coverage`), otherwise a file
     * covered solely by an integration test reads as uncovered.
     */
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      include: ['packages/*/src/**'],
      exclude: [
        // Browser fixtures and generated/type-only files do not execute in
        // these in-process projects, so reporting them would be false signal.
        'packages/playground*/**',
        'packages/**/src/**/generated/**',
        'packages/**/src/**/*.d.ts',
        'packages/**/src/**/types/**',
        // Nuxt SFCs execute only in browser/boot processes. Vitest 5's V8
        // collector otherwise parses their raw source as JavaScript.
        'packages/**/src/**/*.vue',
        'packages/nuxt-directus/src/runtime/types.ts',
        'packages/nuxt-drizzle/src/runtime/types.ts',
        'packages/nuxt-monospace/src/runtime/types.ts',
      ],
    },
    projects: [
      {
        resolve: {
          alias: [...sourceAliases, ...testUtilsAlias],
        },
        test: {
          name: 'unit',
          include: [
            'test/**/*.{test,spec}.ts',
            'packages/*/test/**/*.{test,spec}.ts',
          ],
          exclude: [
            ...configDefaults.exclude,
            '**/e2e/**',
            '**/test/integration/**',
            'packages/nuxt*/**',
            'packages/playground*/**',
          ],
        },
      },
      {
        resolve: {
          // Protocol consumers must validate against the current Shared source.
          alias: [{ find: /^@rstore\/shared$/, replacement: sourceEntry('shared') }],
        },
        test: {
          name: 'nuxt',
          include: ['packages/nuxt*/test/**/*.{test,spec}.ts'],
          exclude: [
            ...configDefaults.exclude,
            '**/e2e/**',
            '**/fixtures/**',
            '**/test/integration/**',
            ...nuxtBootTests,
          ],
        },
      },
      {
        test: {
          name: 'nuxt-boot',
          include: nuxtBootTests,
          // Nuxt test-utils registers lifecycle hooks through a dynamic
          // `vitest` import. Inline it so that import is the active runner,
          // even when a package resolves a different Vite peer instance.
          server: {
            deps: {
              inline: ['@nuxt/test-utils'],
            },
          },
          // Nuxt build + start per file: generous timeouts, and a single fork
          // so the three memory-heavy builds don't race each other.
          testTimeout: 120_000,
          hookTimeout: 300_000,
          maxWorkers: 1,
          fileParallelism: false,
        },
      },
      {
        resolve: {
          alias: [
            ...sourceAliases,
            ...testUtilsAlias,
          ],
        },
        test: {
          name: 'integration',
          include: [integrationGlob],
          exclude: [
            ...configDefaults.exclude,
            '**/fixtures/**',
          ],
          // Real HTTP servers and real SQLite: slower than a unit test, but
          // still far below the Nuxt boot budget.
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
