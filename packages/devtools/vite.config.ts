import { fileURLToPath } from 'node:url'
import ui from '@nuxt/ui/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/** Build inspector independently from library entries in sibling dist files. */
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [vue(), ui({ dts: false, colorMode: false, autoImport: { dts: false }, components: { dts: false } })],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
})
