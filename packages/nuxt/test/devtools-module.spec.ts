import { describe, expect, it } from 'vitest'
import { resolveDevtoolsOptions } from '../src/runtime/devtools/options'

/** Option resolution guards instrumentation inclusion before generated imports exist. */
describe('nuxt devtools configuration', () => {
  it('excludes instrumentation from production even when explicitly enabled', () => {
    expect(resolveDevtoolsOptions(true, false)).toBe(false)
    expect(resolveDevtoolsOptions({ base: '/inspect', readOnly: false }, false)).toBe(false)
  })

  it('supports development opt-out and custom read-only inspector base', () => {
    expect(resolveDevtoolsOptions(false, true)).toBe(false)
    expect(resolveDevtoolsOptions(undefined, true)).toEqual({ base: '/__rstore/', readOnly: false })
    expect(resolveDevtoolsOptions({ base: 'inspect', readOnly: true }, true)).toEqual({ base: '/inspect/', readOnly: true })
  })
})
