import type { Collection, CollectionDefaults, ResolvedCollection, StoreSchema } from '@rstore/shared'
import { describe, expect, it } from 'vitest'
import { defaultGetKey, defaultIsInstanceOf, normalizeCollectionRelations, resolveCollections } from '../src/collection'

describe('default get key', () => {
  it('should return id if present', () => {
    const item = { id: 123, __id: 456 }
    expect(defaultGetKey(item)).toBe(123)
  })

  it('should return __id if id is not present', () => {
    const item = { __id: 456 }
    expect(defaultGetKey(item)).toBe(456)
  })

  it('should return undefined if neither id nor __id is present', () => {
    const item = { name: 'test' }
    expect(defaultGetKey(item)).toBeUndefined()
  })
})

describe('default isInstanceOf', () => {
  it('should return true if item __typename matches collection name', () => {
    const collection = { name: 'TestCollection' } as Collection
    const item = { __typename: 'TestCollection' }
    expect(defaultIsInstanceOf(collection)(item)).toBe(true)
  })

  it('should return false if item __typename does not match collection name', () => {
    const collection = { name: 'TestCollection' } as Collection
    const item = { __typename: 'AnotherCollection' }
    expect(defaultIsInstanceOf(collection)(item)).toBe(false)
  })

  it('should return false if item does not have __typename', () => {
    const collection = { name: 'TestCollection' } as Collection
    const item = { id: 123 }
    expect(defaultIsInstanceOf(collection)(item)).toBe(false)
  })
})

describe('collection', () => {
  it('should resolve collection with defaults', () => {
    const collectionTypes: StoreSchema = [
      {
        name: 'TestCollection',
        meta: {
          path: '/test',
        },
      },
      {
        name: 'Test2',
        getKey: (item: any) => item.id,
      },
    ]
    const defaults: CollectionDefaults = {
      getKey: (item: any) => `${item.id}$default`,
      meta: {
        test: 'meow',
      },
    }
    const resolved = resolveCollections(collectionTypes, defaults)
    expect(resolved[0]!.getKey({ id: 'foo' })).toBe(defaults.getKey?.({ id: 'foo' }))
    expect(resolved[0]!.meta).toEqual({
      path: '/test',
      test: 'meow',
    })
    expect(resolved[1]!.getKey({ id: 'foo' })).toBe((collectionTypes[1] as Collection).getKey?.({ id: 'foo' }))
    expect(resolved[1]!.meta).toEqual({
      test: 'meow',
    })
  })

  it('should resolve all collection props', () => {
    const collectionTypes: StoreSchema = [
      {
        name: 'TestCollection',
        getKey: (item: any) => item.id,
        relations: {
          test: {
            to: {
              Test2: {
                on: {
                  testId: 'id',
                },
              },
            },
          },
        },
        computed: {
          calc: item => item.id + 1,
        },
        fields: {
          createdAt: {
            parse: value => new Date(value),
          },
        },
        formSchema: {
          create: {
            '~standard': {
              validate: value => ({ value }),
              vendor: 'rstore',
              version: 1,
            },
          },
          update: {
            '~standard': {
              validate: value => ({ value }),
              vendor: 'rstore',
              version: 1,
            },
          },
        },
        meta: {
          test: 'meow',
        },
      },
    ]

    const resolved = resolveCollections(collectionTypes)

    expect(resolved[0]!.getKey({ id: 'foo' })).toBe((collectionTypes[0] as Collection).getKey?.({ id: 'foo' }))
    expect(resolved[0]!.relations).toEqual({
      test: {
        to: {
          Test2: {
            on: {
              testId: 'id',
            },
          },
        },
      },
    })
    expect(resolved[0]!.computed.calc).toBeTypeOf('function')
    expect(resolved[0]!.fields!.createdAt!.parse).toBeTypeOf('function')
    expect(resolved[0]!.formSchema.create['~standard']!.vendor).toBe('rstore')
    expect(resolved[0]!.formSchema.update['~standard']!.vendor).toBe('rstore')
    expect(resolved[0]!.meta).toEqual({
      test: 'meow',
    })
  })

  it('should resolve all default props', () => {
    const collectionTypes: StoreSchema = [
      {
        name: 'TestCollection',
      },
    ]

    const defaults: CollectionDefaults = {
      getKey: (item: any) => item.id,
      computed: {
        calc: item => item.id + 1,
      },
      fields: {
        createdAt: {
          parse: value => new Date(value),
        },
      },
      meta: {
        test: 'meow',
      },
    }

    const resolved = resolveCollections(collectionTypes, defaults)

    expect(resolved[0]!.getKey({ id: 0 })).toBe(defaults.getKey?.({ id: 0 }))
    expect(resolved[0]!.relations).toEqual({})
    expect(resolved[0]!.computed.calc).toBeTypeOf('function')
    expect(resolved[0]!.fields!.createdAt!.parse).toBeTypeOf('function')
    expect(resolved[0]!.formSchema.create['~standard']!.vendor).toBe('rstore')
    expect(resolved[0]!.formSchema.update['~standard']!.vendor).toBe('rstore')
    expect(resolved[0]!.meta).toEqual({
      test: 'meow',
    })
  })
})

describe('normalizeCollectionRelations', () => {
  it('should normalize relations defined with collection function', () => {
    const collections = [
      {
        name: 'TestCollection',
        relations: {
          test: {
            to: {
              Test2: {
                on: {
                  'Test2.id': 'TestCollection.testId',
                },
              },
            },
          },
        },
      },
    ] as unknown as ResolvedCollection[]

    const result = collections.slice()
    normalizeCollectionRelations(result)
    expect(result[0]!.relations).toEqual({
      test: {
        to: {
          Test2: {
            on: {
              id: 'testId',
            },
          },
        },
      },
    })
  })
})
