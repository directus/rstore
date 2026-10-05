import { defineConfig } from '@playwright/test'

/**
 * E5 IME gate: a bundled page with two ProseMirror editors bound to an
 * in-page sequencer, driven through the Chrome DevTools Protocol
 * (`Input.imeSetComposition`). Chromium only: the CDP IME API is Chromium's.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  globalSetup: './globalSetup.ts',
  workers: 1,
  timeout: 30 * 60_000,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    headless: true,
  },
})
