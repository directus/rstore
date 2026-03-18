import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const isolationHeaders = {
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'cross-origin',
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '#demo/backend': fileURLToPath(new URL('./src/tutorial/backend.ts', import.meta.url)),
      '#demo/events': fileURLToPath(new URL('./src/tutorial/liveEvents.ts', import.meta.url)),
      '#demo/runtime': fileURLToPath(new URL('./src/tutorial/runtime.ts', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 4173,
    headers: isolationHeaders,
  },
})
