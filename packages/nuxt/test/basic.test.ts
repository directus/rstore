import serialize from 'serialize-javascript'
import { describe, expect, it } from 'vitest'
import { resolveStoreOptions } from '../src/module'

describe('resolveStoreOptions', () => {
  it('merges legacy garbage collection into store options', () => {
    const storeOptions = resolveStoreOptions({
      experimentalGarbageCollection: true,
      store: {
        cacheStaggering: 42,
      },
    })

    expect(storeOptions).toEqual({
      cacheStaggering: 42,
      experimentalGarbageCollection: true,
    })
  })

  it('prefers the nested store option over the legacy flag', () => {
    const storeOptions = resolveStoreOptions({
      experimentalGarbageCollection: true,
      store: {
        experimentalGarbageCollection: false,
      },
    })

    expect(storeOptions.experimentalGarbageCollection).toBe(false)
  })

  it('preserves function-based store options when serialized', () => {
    const storeOptions = resolveStoreOptions({
      store: {
        findDefaults: {
          fetchPolicy: 'cache-and-fetch',
          filter: (item: any) => item.id === 'fixture',
        },
        collectionDefaults: {
          getKey: (item: any) => `fixture:${item.id}`,
        },
      },
    })

    const serialized = serialize(storeOptions)

    expect(serialized).toContain('cache-and-fetch')
    expect(serialized).toContain('item.id === "fixture"')
    // eslint-disable-next-line no-template-curly-in-string
    expect(serialized).toContain('`fixture:${item.id}`')
  })
})
