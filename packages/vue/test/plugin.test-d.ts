import { describe, expectTypeOf, test } from 'vitest'
import { definePlugin } from '../src'

describe('Vue plugin typing', () => {
  test('exposes the Vue store API to plugin hooks', () => {
    const plugin = {
      name: 'type-test',
      setup({ hook }) {
        hook('fetchFirst', ({ store }) => {
          expectTypeOf(store.$collection).toEqualTypeOf<import('../src').VueStore['$collection']>()
        })
      },
    } satisfies import('../src').VuePlugin

    definePlugin(plugin)
  })
})
