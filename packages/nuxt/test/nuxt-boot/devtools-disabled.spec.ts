import { fileURLToPath } from 'node:url'
import { $fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { assertDevtoolsRoutesAbsent } from '../utils/devtoolsExclusion'

/** Disabled development boots actual generated plugin while mounting no inspector/relay. */
describe('nuxt development devtools opt-out', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/devtools-disabled', import.meta.url)),
    dev: true,
    build: true,
    browser: false,
  })

  it('keeps application store working while excluding discovery, bootstrap, and MCP', async () => {
    expect(await $fetch<string>('/')).toContain('store-ready')
    await assertDevtoolsRoutesAbsent(url('/'))
  })
})
