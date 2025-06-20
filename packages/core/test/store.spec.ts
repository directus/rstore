import type { Cache, FetchPolicy, ModelDefaults, ModelList, Plugin } from '@rstore/shared'
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
      models: [] as ModelList,
      modelDefaults: {} as ModelDefaults,
      plugins: [],
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
    expect(store.$models).toBeDefined()
    expect(store.$modelDefaults).toEqual({})
    expect(store.$plugins).toEqual([])
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
      const models: ModelList = [
        {
          name: 'Test',
          fields: {
            name: {
              parse: (value: any) => value.toUpperCase(),
            },
          },
        },
      ]
      options.models = models
      options.hooks = createHooks()

      const store = await createStoreCore(options)
      const item = { name: 'test' }

      store.$processItemParsing(store.$models[0], item)

      expect(item.name).toBe('TEST')
    })

    it('handle nested relations in result', async () => {
      const models: ModelList = [
        {
          name: 'Message',
          relations: {
            author: {
              to: {
                User: {
                  on: 'id',
                  eq: 'authorId',
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
      options.models = models
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

      store.$processItemParsing(store.$models[0], message)

      expect(message.author.createdAt).toBeInstanceOf(Date)
      expect(message.author.createdAt.toISOString()).toBe('2023-01-01T00:00:00.000Z')
    })
  })

  describe('field serialization', () => {
    it('calls custom field serialize', async () => {
      const models: ModelList = [
        {
          name: 'Test',
          fields: {
            date: {
              serialize: (value: Date) => value.toISOString(),
            },
          },
        },
      ]
      options.models = models
      options.hooks = createHooks()

      const store = await createStoreCore(options)
      const item = { date: new Date('2023-01-01T00:00:00Z') }

      store.$processItemSerialization(store.$models[0], item)

      expect(item.date).toBe('2023-01-01T00:00:00.000Z')
    })

    it('skips serialization if value is null', async () => {
      const serializeMock = vi.fn()
      const models: ModelList = [
        {
          name: 'Test',
          fields: {
            optionalField: {
              serialize: serializeMock,
            },
          },
        },
      ]
      options.models = models
      options.hooks = createHooks()

      const store = await createStoreCore(options)
      const item = { optionalField: null }

      store.$processItemSerialization(store.$models[0], item)

      expect(serializeMock).not.toHaveBeenCalled()
    })

    it('handles nested fields with dot notation', async () => {
      const models: ModelList = [
        {
          name: 'Test',
          fields: {
            'metadata.createdAt': {
              serialize: (value: Date) => value.toISOString(),
            },
          },
        },
      ]
      options.models = models
      options.hooks = createHooks()

      const store = await createStoreCore(options)
      const item = {
        metadata: {
          createdAt: new Date('2023-01-01T00:00:00Z'),
        },
      }

      store.$processItemSerialization(store.$models[0], item)

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

  describe('getModel', () => {
    it('should return the correct model for an item', async () => {
      const models: ModelList = [
        {
          name: 'Test',
          isInstanceOf: (item: any) => item.__typename === 'Test',
        },
        {
          name: 'AnotherTest',
          isInstanceOf: (item: any) => item.__typename === 'AnotherTest',
        },
      ]
      options.models = models
      const store = await createStoreCore(options)

      const testItem = { __typename: 'Test' }
      const anotherTestItem = { __typename: 'AnotherTest' }

      expect(store.$getModel(testItem)).toBe(store.$models[0])
      expect(store.$getModel(anotherTestItem)).toBe(store.$models[1])
    })

    it('should return the correct model for an item with no typename', async () => {
      const models: ModelList = [
        {
          name: 'User',
          isInstanceOf: (item: any) => 'username' in item,
        },
        {
          name: 'Bot',
          isInstanceOf: (item: any) => 'botname' in item,
        },
      ]
      options.models = models
      const store = await createStoreCore(options)

      const testItem = { username: 'toto' }
      const anotherTestItem = { botname: 'bender' }

      expect(store.$getModel(testItem)).toBe(store.$models[0])
      expect(store.$getModel(anotherTestItem)).toBe(store.$models[1])
    })

    it('should return null if no model matches the item', async () => {
      const models: ModelList = [
        {
          name: 'Test',
          isInstanceOf: (item: any) => item.__typename === 'Test',
        },
      ]
      options.models = models
      const store = await createStoreCore(options)

      const unknownItem = { __typename: 'Unknown' }

      expect(store.$getModel(unknownItem)).toBeNull()
    })

    it('should search in only specified types', async () => {
      const models: ModelList = [
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
      options.models = models
      const store = await createStoreCore(options)

      const testItem = { username: 'toto' }

      expect(store.$getModel(testItem)).toBe(store.$models[0])
      expect(store.$getModel(testItem, ['User2', 'Bot'])).toBe(store.$models[1])
    })

    it('should return if only one specified model', async () => {
      const models: ModelList = [
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
      options.models = models
      const store = await createStoreCore(options)

      const testItem = { username: 'toto' }

      expect(store.$getModel(testItem, ['Foo'])).toBe(store.$models[2])
    })
  })
})
