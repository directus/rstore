import type { VueStore } from '@rstore/vue'
import type { TestCollectionDefaults, TestSchema } from '../../shared/test/types/collections'
import { definePlugin } from '@rstore/vue'
import { describe, expectTypeOf, test } from 'vitest'

type TestStore = VueStore<TestSchema, TestCollectionDefaults>

declare module '@rstore/shared' {
  interface RstoreGlobal {
    // eslint-disable-next-line ts/method-signature-style
    store(): TestStore
  }
}

describe('Vue plugin global store typing', () => {
  test('retains an application augmented Vue store in hook callbacks', () => {
    definePlugin({
      name: 'global-store-type-test',
      setup({ hook }) {
        hook('fetchFirst', ({ store }) => {
          expectTypeOf(store).toEqualTypeOf<TestStore>()
          expectTypeOf(store.users).toEqualTypeOf<TestStore['users']>()
        })
      },
    })
  })
})
