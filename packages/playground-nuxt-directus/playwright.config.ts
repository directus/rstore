import process from 'node:process'
import { defineConfig } from '@playwright/test'

const host = '127.0.0.1'
const port = 4175
const directusURL = 'http://127.0.0.1:8056'
const directusToken = 'rstore-directus-e2e-token'
const baseURL = `http://${host}:${port}`

export default defineConfig({
  testDir: './e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['list']]
    : [['list'], ['html', { open: 'never' }]],
  expect: {
    timeout: 15_000,
  },
  globalTeardown: './e2e/global-teardown',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `export DIRECTUS_URL=${directusURL} DIRECTUS_TOKEN=${directusToken} NITRO_HOST=${host}; pnpm directus:e2e:up && pnpm directus:e2e:seed && pnpm dev:build && pnpm dev:preview --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
