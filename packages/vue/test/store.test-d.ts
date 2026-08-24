import type { CollectionDefaults } from '@rstore/shared'
import type { VueStore } from '../src'
import { describe, expectTypeOf, test } from 'vitest'

describe('store typing', () => {
  test('$wrapMutation accepts callables and preserves return types', () => {
    const store = null as any as VueStore<[], CollectionDefaults>
    const mutation = store.$wrapMutation((value: number) => String(value))

    expectTypeOf(mutation(1)).toEqualTypeOf<string>()
    // @ts-expect-error mutation wrappers only accept callable values
    store.$wrapMutation(1)
  })
})
