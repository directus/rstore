import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { defineConfig } from '@playwright/test'
import { assertLocalBrowserEnvironment } from './environment'

assertLocalBrowserEnvironment()

/** Isolated output keeps browsers and source fault probes out of dependency caches. */
const artifacts = process.env.RSTORE_BROWSER_ARTIFACT_DIR ?? resolve(tmpdir(), `rstore-browser-${process.pid}`)
/** A distinct port lets independent checkout/probe runs coexist. */
const port = process.env.RSTORE_BROWSER_PORT ?? '4179'
/** Browser tests import repository sources from the same loopback origin. */
const baseURL = `http://127.0.0.1:${port}`
// Headed focus checks must never inherit a developer's desktop display.
if (process.env.RSTORE_BROWSER_XVFB !== '1' || !/^:\d+(?:\.\d+)?$/.test(process.env.DISPLAY ?? '') || process.env.WAYLAND_DISPLAY) {
  throw new Error('Run browser tests through pnpm test:browser; native focus requires its private Xvfb display.')
}

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  outputDir: resolve(artifacts, 'results'),
  reporter: [['list']],
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    launchOptions: { args: ['--ozone-platform=x11'] },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'headless', testIgnore: 'focus.spec.ts' },
    { name: 'focus', testMatch: 'focus.spec.ts', use: { headless: false } },
  ],
})
