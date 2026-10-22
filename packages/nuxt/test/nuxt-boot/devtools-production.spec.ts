import { fileURLToPath } from 'node:url'
import { $fetch, setup, url, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { assertDevtoolsBundleAbsent, assertDevtoolsRoutesAbsent } from '../utils/devtoolsExclusion'

/** Explicit enable still must not leak instrumentation into an actual production build. */
describe('nuxt production devtools exclusion', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/devtools-exclusion', import.meta.url)),
    dev: false,
    build: true,
    browser: false,
  })

  it('serves production store without inspector resources or private capture/bootstrap code', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('store-ready')
    expect(html).not.toContain('rstoreDevtoolsSSR')
    expect(html).not.toContain('authToken')
    await assertDevtoolsRoutesAbsent(url('/'))
    const outputDirectory = useTestContext().nuxt!.options.nitro.output?.dir
    expect(outputDirectory).toBeTypeOf('string')
    await assertDevtoolsBundleAbsent(outputDirectory!)
  })
})
