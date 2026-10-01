import type { CollectionDefaults } from '@rstore/shared'
import type { VueStore } from '../src'
import { describe, expectTypeOf, test } from 'vitest'
import { addCollections } from '../src'

describe('store typing', () => {
  test('addCollections accepts readonly collection definitions', () => {
    const store = null as any as VueStore<[], CollectionDefaults>
    const collections = [{ name: 'notes' }, { name: 'tags' }] as const

    expectTypeOf(addCollections(store, collections)).toEqualTypeOf<void>()
    // @ts-expect-error collection definitions require a name
    addCollections(store, [{}])
  })

  test('$wrapMutation accepts callables and preserves return types', () => {
    const store = null as any as VueStore<[], CollectionDefaults>
    const mutation = store.$wrapMutation((value: number) => String(value))

    expectTypeOf(mutation(1)).toEqualTypeOf<string>()
    // @ts-expect-error mutation wrappers only accept callable values
    store.$wrapMutation(1)
  })
})
