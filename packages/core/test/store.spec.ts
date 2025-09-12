import type { Cache, CollectionDefaults, FetchPolicy, Plugin, StoreSchema } from '@rstore/shared'
import type { CreateStoreCoreOptions } from '../src/store'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultFetchPolicy } from '../src'
import { createStoreCore } from '../src/store'

describe('createStoreCore', () => {
  let options: CreateStoreCoreOptions

  beforeEach(() => {
    options = {
      cache: {} as Cache,
      schema: [] as StoreSchema,
      collectionDefaults: {} as CollectionDefaults,
      plugins: []!,
      hooks: {
        callHookSync: vi.fn(),
        callHook: vi.fn(),
        hook: vi.fn(),
      } as any,
      findDefaults: {},
    }
  })

  it('should create a store with default options', async () => {
    const store = await createStoreCore(options)
    expect(store).toBeDefined()
    expect(store.$cache).toBe(options.cache)
    expect(store.$collections).toBeDefined()
    expect(store.$collectionDefaults).toEqual({})
    expect(store.$plugins.filter(p => !p.meta?.builtin)).toEqual([])
    expect(store.$hooks).toBe(options.hooks)
    expect(store.$findDefaults).toEqual({})
  })

  it('should call setup for each plugin', async () => {
    const plugin1 = {
      name: 'test1',
      setup: vi.fn(),
    } as Plugin
    const plugin2 = {
      name: 'test2',
      setup: vi.fn(),
    } as Plugin
    options.plugins = [plugin1, plugin2]

    await createStoreCore(options)

    expect(plugin1.setup).toHaveBeenCalled()
    expect(plugin2.setup).toHaveBeenCalled()
  })

  it('should call init hook after store creation', async () => {
    await createStoreCore(options)
    expect(options.hooks.callHook).toHaveBeenCalledWith('init', expect.anything())
  })

  describe('field parsing', () => {
    it('calls custom field parse', async () => {
      const schema: StoreSchema = [
        {
          name: 'Test',
          fields: {
            name: {
              parse: (value: any) => value.toUpperCase(),
            },
          },
        },
      ]
      options.schema = schema
      options.hooks = createHooks()

      const store = await createStoreCore(options)
      const item = { name: 'test' }

      store.$processItemParsing(store.$collections[0]!, item)

      expect(item.name).toBe('TEST')
    })

    it('handle nested relations in result', async () => {
      const schema: StoreSchema = [
        {
          name: 'Message',
          relations: {
            author: {
              to: {
                User: {
                  on: {
                    id: 'authorId',
                  },
                },
              },
            },
          },
        },
        {
          name: 'User',
          fields: {
            createdAt: {
              parse: (value: any) => new Date(value),
            },
          },
        },
      ]
      options.schema = schema
      options.hooks = createHooks()

      const store = await createStoreCore(options)

      const message: any = {
        id: 'm1',
        authorId: 'u1',
        author: {
          id: 'u1',
          username: 'test',
          createdAt: '2023-01-01T00:00:00Z',
        },
      }

      store.$processItemParsing(store.$collections[0]!, message)

      expect(message.author.createdAt).toBeInstanceOf(Date)
      expect(message.author.createdAt.toISOString()).toBe('2023-01-01T00:00:00.000Z')
    })
  })

  describe('field serialization', () => {
    it('calls custom field serialize', async () => {
      const schema: StoreSchema = [
        {
          name: 'Test',
          fields: {
            date: {
              serialize: (value: Date) => value.toISOString(),
            },
          },
        },
      ]
      options.schema = schema
      options.hooks = createHooks()

      const store = await createStoreCore(options)
      const item = { date: new Date('2023-01-01T00:00:00Z') }

      store.$processItemSerialization(store.$collections[0]!, item)

      expect(item.date).toBe('2023-01-01T00:00:00.000Z')
    })

    it('skips serialization if value is null', async () => {
      const serializeMock = vi.fn()
      const schema: StoreSchema = [
        {
          name: 'Test',
          fields: {
            optionalField: {
              serialize: serializeMock,
            },
          },
        },
      ]
      options.schema = schema
      options.hooks = createHooks()

      const store = await createStoreCore(options)
      const item = { optionalField: null }

      store.$processItemSerialization(store.$collections[0]!, item)

      expect(serializeMock).not.toHaveBeenCalled()
    })

    it('handles nested fields with dot notation', async () => {
      const schema: StoreSchema = [
        {
          name: 'Test',
          fields: {
            'metadata.createdAt': {
              serialize: (value: Date) => value.toISOString(),
            },
          },
        },
      ]
      options.schema = schema
      options.hooks = createHooks()

      const store = await createStoreCore(options)
      const item = {
        metadata: {
          createdAt: new Date('2023-01-01T00:00:00Z'),
        },
      }

      store.$processItemSerialization(store.$collections[0]!, item)

      expect(item.metadata.createdAt).toBe('2023-01-01T00:00:00.000Z')
    })
  })

  describe('getFetchPolicy', () => {
    it('should return default fetch policy if no value is provided', async () => {
      const store = await createStoreCore(options)
      const fetchPolicy = store.$getFetchPolicy(undefined)
      expect(fetchPolicy).toBe(defaultFetchPolicy)
    })

    it('should return provided fetch policy if value is provided', async () => {
      const customFetchPolicy = 'some-policy' as FetchPolicy
      const store = await createStoreCore(options)
      const fetchPolicy = store.$getFetchPolicy(customFetchPolicy)
      expect(fetchPolicy).toBe(customFetchPolicy)
    })

    it('should return findDefaults fetch policy if no value is provided and findDefaults has fetch policy', async () => {
      const customFetchPolicy = 'find-default-policy' as FetchPolicy
      options.findDefaults = { fetchPolicy: customFetchPolicy }
      const store = await createStoreCore(options)
      const fetchPolicy = store.$getFetchPolicy(undefined)
      expect(fetchPolicy).toBe(customFetchPolicy)
    })
  })

  describe('getCollection', () => {
    it('should return the correct collection for an item', async () => {
      const schema: StoreSchema = [
        {
          name: 'Test',
          isInstanceOf: (item: any) => item.__typename === 'Test',
        },
        {
          name: 'AnotherTest',
          isInstanceOf: (item: any) => item.__typename === 'AnotherTest',
        },
      ]
      options.schema = schema
      const store = await createStoreCore(options)

      const testItem = { __typename: 'Test' }
      const anotherTestItem = { __typename: 'AnotherTest' }

      expect(store.$getCollection(testItem)).toBe(store.$collections[0])
      expect(store.$getCollection(anotherTestItem)).toBe(store.$collections[1])
    })

    it('should return the correct collection for an item with no typename', async () => {
      const schema: StoreSchema = [
        {
          name: 'User',
          isInstanceOf: (item: any) => 'username' in item,
        },
        {
          name: 'Bot',
          isInstanceOf: (item: any) => 'botname' in item,
        },
      ]
      options.schema = schema
      const store = await createStoreCore(options)

      const testItem = { username: 'toto' }
      const anotherTestItem = { botname: 'bender' }

      expect(store.$getCollection(testItem)).toBe(store.$collections[0])
      expect(store.$getCollection(anotherTestItem)).toBe(store.$collections[1])
    })

    it('should return null if no collection matches the item', async () => {
      const schema: StoreSchema = [
        {
          name: 'Test',
          isInstanceOf: (item: any) => item.__typename === 'Test',
        },
      ]
      options.schema = schema
      const store = await createStoreCore(options)

      const unknownItem = { __typename: 'Unknown' }

      expect(store.$getCollection(unknownItem)).toBeNull()
    })

    it('should search in only specified types', async () => {
      const schema: StoreSchema = [
        {
          name: 'User',
          isInstanceOf: (item: any) => 'username' in item,
        },
        {
          name: 'User2',
          isInstanceOf: (item: any) => 'username' in item,
        },
        {
          name: 'Bot',
          isInstanceOf: (item: any) => 'botname' in item,
        },
      ]
      options.schema = schema
      const store = await createStoreCore(options)

      const testItem = { username: 'toto' }

      expect(store.$getCollection(testItem)).toBe(store.$collections[0])
      expect(store.$getCollection(testItem, ['User2', 'Bot'])).toBe(store.$collections[1])
    })

    it('should return if only one specified collection', async () => {
      const schema: StoreSchema = [
        {
          name: 'User',
          isInstanceOf: (item: any) => 'username' in item,
        },
        {
          name: 'Bot',
          isInstanceOf: (item: any) => 'botname' in item,
        },
        {
          name: 'Foo',
          isInstanceOf: (item: any) => 'fooname' in item,
        },
      ]
      options.schema = schema
      const store = await createStoreCore(options)

      const testItem = { username: 'toto' }

      expect(store.$getCollection(testItem, ['Foo'])).toBe(store.$collections[2])
    })
  })
})
