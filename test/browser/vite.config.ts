import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { runtimeSourceAliases, sourceEntry } from '../utils/sourceAliases'

/** Browser fixtures and production packages share one repository root. */
const root = fileURLToPath(new URL('../../', import.meta.url))
/** Keep transformed dependencies private when tests run against a fault probe. */
const artifacts = process.env.RSTORE_BROWSER_ARTIFACT_DIR ?? resolve(tmpdir(), `rstore-browser-${process.pid}`)

export default defineConfig({
  root,
  cacheDir: resolve(artifacts, 'vite'),
  // Dynamic scenario imports must not trigger dependency discovery and reload an active test.
  optimizeDeps: { noDiscovery: true, include: ['vue', '@vueuse/core', 'klona', 'fast-equals'] },
  resolve: {
    alias: {
      ...runtimeSourceAliases,
      '@rstore/offline': sourceEntry('offline'),
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
