import process from 'node:process'
import { defineConfig } from '@playwright/test'

const host = '127.0.0.1'
const port = 4174
const baseURL = `http://${host}:${port}`

export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['list']]
    : [['list'], ['html', { open: 'never' }]],
  // Realtime tests cross WebSocket + DB + pubsub + remote-tab render —
  // each step adds a few hundred ms under load. Bump the default expect
  // timeout so per-test `{ timeout: ... }` overrides are rarely needed.
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm db:push && pnpm dev:build && NITRO_HOST=${host} pnpm dev:preview --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
