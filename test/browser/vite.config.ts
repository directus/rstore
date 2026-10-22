import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { rstoreDevtools } from '../../packages/devtools/src/vite'
import { runtimeSourceAliases, sourceEntry } from '../utils/sourceAliases'
import { multiplayerNuxtDefines, multiplayerNuxtRuntime } from './multiplayerNuxtRuntime'
import { multiplayerRelay } from './multiplayerRelay'

/** Browser fixtures and production packages share one repository root. */
const root = fileURLToPath(new URL('../../', import.meta.url))
/** Keep transformed dependencies private when tests run against a fault probe. */
const artifacts = process.env.RSTORE_BROWSER_ARTIFACT_DIR ?? resolve(tmpdir(), `rstore-browser-${process.pid}`)

export default defineConfig({
  root,
  plugins: [
    multiplayerRelay(),
    multiplayerNuxtRuntime(),
    rstoreDevtools({ clientDir: resolve(root, 'packages/devtools/dist/client') }),
  ],
  define: {
    ...multiplayerNuxtDefines,
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  cacheDir: resolve(artifacts, 'vite'),
  // Dynamic scenario imports must not trigger dependency discovery and reload an active test.
  optimizeDeps: {
    noDiscovery: true,
    include: ['vue', '@vueuse/core', 'klona', 'fast-equals', 'devframe/in-page-channel'],
    // Nuxt runtime needs the same client build switches as fixture modules.
    exclude: ['nuxt/app'],
  },
  resolve: {
    alias: {
      ...runtimeSourceAliases,
      '@rstore/offline': sourceEntry('offline'),
      'nuxt/app': resolve(root, 'packages/nuxt-multiplayer/node_modules/nuxt/dist/app/nuxt.js'),
      '#build/nuxt.config.mjs': resolve(root, 'packages/nuxt-multiplayer/test/fixtures/nuxtRuntimeConfig.ts'),
    },
    dedupe: ['vue'],
  },
  server: {
    open: false,
    host: '127.0.0.1',
    port: Number(process.env.RSTORE_BROWSER_PORT ?? 4179),
    strictPort: true,
  },
})
