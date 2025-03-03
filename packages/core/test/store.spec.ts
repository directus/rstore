import type { Cache, FetchPolicy, Model, ModelDefaults, Plugin } from '@rstore/shared'
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
      model: {} as Model,
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
    expect(store.cache).toBe(options.cache)
    expect(store.model).toBeDefined()
    expect(store.modelDefaults).toEqual({})
    expect(store.plugins).toEqual([])
    expect(store.hooks).toBe(options.hooks)
    expect(store.findDefaults).toEqual({})
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

  it('calls custom field parse', async () => {
    const model: Model = {
      Test: {
        name: 'Test',
        fields: {
          name: {
            parse: (value: any) => value.toUpperCase(),
          },
        },
      },
    }
    options.model = model
    options.hooks = createHooks()

    const store = await createStoreCore(options)
    const item = { name: 'test' }

    store.processItemParsing(store.model.Test, item)

    expect(item.name).toBe('TEST')
  })

  describe('getFetchPolicy', () => {
    it('should return default fetch policy if no value is provided', async () => {
      const store = await createStoreCore(options)
      const fetchPolicy = store.getFetchPolicy(undefined)
      expect(fetchPolicy).toBe(defaultFetchPolicy)
    })

    it('should return provided fetch policy if value is provided', async () => {
      const customFetchPolicy = 'some-policy' as FetchPolicy
      const store = await createStoreCore(options)
      const fetchPolicy = store.getFetchPolicy(customFetchPolicy)
      expect(fetchPolicy).toBe(customFetchPolicy)
    })

    it('should return findDefaults fetch policy if no value is provided and findDefaults has fetch policy', async () => {
      const customFetchPolicy = 'find-default-policy' as FetchPolicy
      options.findDefaults = { fetchPolicy: customFetchPolicy }
      const store = await createStoreCore(options)
      const fetchPolicy = store.getFetchPolicy(undefined)
      expect(fetchPolicy).toBe(customFetchPolicy)
    })
  })

  describe('getType', () => {
    it('should return the correct type for an item', async () => {
      const model: Model = {
        Test: {
          name: 'Test',
          isInstanceOf: (item: any) => item.__typename === 'Test',
        },
        AnotherTest: {
          name: 'AnotherTest',
          isInstanceOf: (item: any) => item.__typename === 'AnotherTest',
        },
      }
      options.model = model
      const store = await createStoreCore(options)

      const testItem = { __typename: 'Test' }
      const anotherTestItem = { __typename: 'AnotherTest' }

      expect(store.getType(testItem)).toBe(store.model.Test)
      expect(store.getType(anotherTestItem)).toBe(store.model.AnotherTest)
    })

    it('should return the correct type for an item with no typename', async () => {
      const model: Model = {
        User: {
          name: 'User',
          isInstanceOf: (item: any) => 'username' in item,
        },
        Bot: {
          name: 'Bot',
          isInstanceOf: (item: any) => 'botname' in item,
        },
      }
      options.model = model
      const store = await createStoreCore(options)

      const testItem = { username: 'toto' }
      const anotherTestItem = { botname: 'bender' }

      expect(store.getType(testItem)).toBe(store.model.User)
      expect(store.getType(anotherTestItem)).toBe(store.model.Bot)
    })

    it('should return null if no type matches the item', async () => {
      const model: Model = {
        Test: {
          name: 'Test',
          isInstanceOf: (item: any) => item.__typename === 'Test',
        },
      }
      options.model = model
      const store = await createStoreCore(options)

      const unknownItem = { __typename: 'Unknown' }

      expect(store.getType(unknownItem)).toBeNull()
    })

    it('should search in only specified types', async () => {
      const model: Model = {
        User: {
          name: 'User',
          isInstanceOf: (item: any) => 'username' in item,
        },
        User2: {
          name: 'User',
          isInstanceOf: (item: any) => 'username' in item,
        },
        Bot: {
          name: 'Bot',
          isInstanceOf: (item: any) => 'botname' in item,
        },
      }
      options.model = model
      const store = await createStoreCore(options)

      const testItem = { username: 'toto' }

      expect(store.getType(testItem)).toBe(store.model.User)
      expect(store.getType(testItem, ['User2', 'Bot'])).toBe(store.model.User2)
    })

    it('should return if only one specified type', async () => {
      const model: Model = {
        User: {
          name: 'User',
          isInstanceOf: (item: any) => 'username' in item,
        },
        Bot: {
          name: 'Bot',
          isInstanceOf: (item: any) => 'botname' in item,
        },
        Foo: {
          name: 'Foo',
          isInstanceOf: (item: any) => 'fooname' in item,
        }
      }
      options.model = model
      const store = await createStoreCore(options)

      const testItem = { username: 'toto' }

      expect(store.getType(testItem, ['Foo'])).toBe(store.model.Foo)
    })
  })
})
