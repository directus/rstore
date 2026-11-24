import type { CacheTombstone, CacheTombstones } from '@rstore/shared'
import type { TombstoneStore } from '../src'
import { describe, expectTypeOf, test } from 'vitest'

describe('tombstone store contract', () => {
  test('extends Shared cache contracts', () => {
    expectTypeOf<TombstoneStore>().toExtend<CacheTombstones>()
    expectTypeOf<TombstoneStore['set']>().parameter(0).toEqualTypeOf<CacheTombstone>()
  })
})
