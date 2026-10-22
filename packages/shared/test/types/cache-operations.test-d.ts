import type { Cache, CacheOperationResult } from '@rstore/shared'
import { describe, expectTypeOf, it } from 'vitest'

describe('custom cache operation compatibility', () => {
  it('allows legacy void callbacks with incidental non-void returns', () => {
    const queue: unknown[] = []
    const keys = new Set<string | number>()
    const cache: Pick<Cache, 'writeItem' | 'deleteItem' | 'clear'> = {
      writeItem: params => queue.push(params),
      deleteItem: params => keys.delete(params.key),
      clear: () => queue.splice(0),
    }
    expectTypeOf(cache.writeItem).returns.toEqualTypeOf<void>()
    expectTypeOf(cache.deleteItem).returns.toEqualTypeOf<void>()
    expectTypeOf(cache.clear).returns.toEqualTypeOf<void>()
  })

  it('exposes completion only through optional receipt capability', () => {
    expectTypeOf<NonNullable<Cache['receipts']>['writeItem']>().returns.toEqualTypeOf<CacheOperationResult>()
    expectTypeOf<NonNullable<Cache['receipts']>['deleteItem']>().returns.toEqualTypeOf<CacheOperationResult>()
    expectTypeOf<NonNullable<Cache['receipts']>['clear']>().returns.toEqualTypeOf<CacheOperationResult>()
  })
})
