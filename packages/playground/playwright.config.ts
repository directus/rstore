import process from 'node:process'
import { defineConfig } from '@playwright/test'

const host = '127.0.0.1'
const port = 4173
const baseURL = `http://${host}:${port}`

export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['list']]
    : [['list'], ['html', { open: 'never' }]],
  // Multiplayer/collab tests round-trip through WebSocket pub/sub and
  // re-render across tabs — give assertions a generous polling window
  // so they're stable under CI load without per-call timeout overrides.
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    name: 'playground',
    command: `NUXT_SESSION_PASSWORD=e2e_session_password_32_chars_long pnpm dev:build && NITRO_HOST=${host} NUXT_SESSION_PASSWORD=e2e_session_password_32_chars_long pnpm dev:preview --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    stdout: process.env.CI ? 'pipe' : 'ignore',
    timeout: 180_000,
  },
})
