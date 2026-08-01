import type { Cache, CollectionDefaults, Plugin, StoreSchema } from '@rstore/shared'
import type { CreateStoreCoreOptions } from '../src/store'
import { createHooks } from '@rstore/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  describe('plugin collection defaults fields', () => {
    it('should propagate plugin field defaults when user provided collectionDefaults.fields', async () => {
      const pluginParse = (value: any) => `plugin:${value}`
      options.schema = [{ name: 'messages' }]
      options.collectionDefaults = {
        fields: {
          createdAt: {
            serialize: (value: Date) => value.toISOString(),
          },
        },
      }
      options.plugins = [{
        name: 'test-plugin',
        setup: ({ addCollectionDefaults }) => {
          addCollectionDefaults({
            fields: {
              createdAt: {
                parse: pluginParse,
              },
            },
          })
        },
      }]

      const store = await createStoreCore(options)
      const collection = store.$collections.find(c => c.name === 'messages')!

      // Both the user default and the plugin default reach the collection
      expect(collection.fields!.createdAt!.serialize).toBeTypeOf('function')
      expect(collection.fields!.createdAt!.parse).toBe(pluginParse)
    })

    it('should propagate plugin field defaults when user did not provide collectionDefaults', async () => {
      const pluginParse = (value: any) => `plugin:${value}`
      options.schema = [{ name: 'messages' }]
      options.collectionDefaults = undefined
      options.plugins = [{
        name: 'test-plugin',
        setup: ({ addCollectionDefaults }) => {
          addCollectionDefaults({
            fields: {
              createdAt: {
                parse: pluginParse,
              },
            },
          })
        },
      }]

      const store = await createStoreCore(options)
      const collection = store.$collections.find(c => c.name === 'messages')!

      expect(collection.fields!.createdAt!.parse).toBe(pluginParse)
    })

    it('should not let plugin field defaults override collection-specific field configs nor leak between collections', async () => {
      const collectionParse = (value: any) => `collection:${value}`
      const pluginParse = (value: any) => `plugin:${value}`
      options.schema = [
        {
          name: 'messages',
          fields: {
            createdAt: {
              parse: collectionParse,
            },
          },
        },
        { name: 'users' },
      ]
      options.plugins = [{
        name: 'test-plugin',
        setup: ({ addCollectionDefaults }) => {
          addCollectionDefaults({
            fields: {
              createdAt: {
                parse: pluginParse,
              },
            },
          })
        },
      }]

      const store = await createStoreCore(options)
      const messages = store.$collections.find(c => c.name === 'messages')!
      const users = store.$collections.find(c => c.name === 'users')!

      // Collection-specific config wins over the plugin default
      expect(messages.fields!.createdAt!.parse).toBe(collectionParse)
      // Other collections get the plugin default, not the messages-specific config
      expect(users.fields!.createdAt!.parse).toBe(pluginParse)
    })
  })

  describe('resolve find options', () => {
    it('should resolve to default fetch policy if not provided', async () => {
      options.schema = [
        { name: 'messages' },
      ]
      const store = await createStoreCore(options)

      const collection = store.$collections.find(c => c.name === 'messages')!

      const resolved = store.$resolveFindOptions(collection, {}, true, {})

      expect(resolved.fetchPolicy).toBe(defaultFetchPolicy)
      expect(resolved.fetchOptions.autoRefresh).toBe('manual')
      expect(resolved.resultMode).toBe('computed')
    })

    it('should usee the default find options from the store', async () => {
      options.schema = [
        { name: 'messages' },
      ]
      options.findDefaults = {
        fetchPolicy: 'fetch-only',
      }
      const store = await createStoreCore(options)
      const collection = store.$collections.find(c => c.name === 'messages')!

      const resolved = store.$resolveFindOptions(collection, {}, true, {})

      expect(resolved.fetchPolicy).toBe('fetch-only')
      expect(resolved.resultMode).toBe('computed')
    })

    it('should override default find options with provided options', async () => {
      options.schema = [
        { name: 'messages' },
      ]
      options.findDefaults = {
        pageSize: 25,
        fetchPolicy: 'fetch-only',
        resultMode: 'responseRefs',
      }
      const store = await createStoreCore(options)
      const collection = store.$collections.find(c => c.name === 'messages')!

      const resolved = store.$resolveFindOptions(collection, { fetchPolicy: 'cache-and-fetch' }, true, {})

      expect(resolved.fetchPolicy).toBe('cache-and-fetch')
      expect(resolved.pageSize).toBe(25)
      expect(resolved.resultMode).toBe('responseRefs')
    })

    it('should merge fetch options with defaults', async () => {
      options.schema = [
        { name: 'messages' },
      ]
      options.findDefaults = {
        fetchOptions: {
          autoRefresh: 'windowFocus',
        },
      }
      const store = await createStoreCore(options)
      const collection = store.$collections.find(c => c.name === 'messages')!

      const resolved = store.$resolveFindOptions(collection, {}, true, {})
      const overridden = store.$resolveFindOptions(collection, {
        fetchOptions: {
          autoRefresh: 'manual',
        },
      }, true, {})

      expect(resolved.fetchOptions.autoRefresh).toBe('windowFocus')
      expect(overridden.fetchOptions.autoRefresh).toBe('manual')
    })

    it('should call resolveFindOptions hook', async () => {
      options.schema = [
        { name: 'messages' },
      ]
      options.hooks = createHooks()
      options.hooks.hook('resolveFindOptions', ({ updateFindOptions }) => {
        updateFindOptions({
          fetchPolicy: 'cache-and-fetch',
        })
      })
      const store = await createStoreCore(options)
      const collection = store.$collections.find(c => c.name === 'messages')!

      const resolved = store.$resolveFindOptions(collection, { fetchPolicy: 'cache-only' }, true, {})

      expect(resolved.fetchPolicy).toBe('cache-and-fetch')
    })
  })

  describe('mutate', () => {
    it('should run before hooks, callback, after hooks, cache, and history', async () => {
      const applyResult = { written: [2], deleted: [], skipped: 0 }
      const applyMutation = vi.fn((_params: any) => applyResult)
      const callback = vi.fn(() => ({ id: 1, name: 'From callback' }))
      const beforeMutation = vi.fn(({ modifyItem }) => {
        modifyItem('name', 'From before hook')
      })
      const afterMutation = vi.fn(({ setResult }) => {
        setResult({ id: 2, name: 'Changed' })
      })
      const createItem = vi.fn()

      options.schema = [{ name: 'messages' }]
      options.cache = { applyMutation } as unknown as Cache
      options.hooks = createHooks()
      options.hooks.hook('beforeMutation', beforeMutation)
      options.hooks.hook('createItem', createItem)
      options.hooks.hook('afterMutation', afterMutation)

      const store = await createStoreCore(options)
      const collection = store.$collections[0]!
      const result = await store.$mutate({
        collection,
        mutation: 'create',
        item: { name: 'Original' },
      }, callback)

      expect(result).toEqual({ id: 2, name: 'Changed' })
      expect(beforeMutation).toHaveBeenCalledWith(expect.objectContaining({
        store,
        meta: {},
        collection,
        mutation: 'create',
        modifyItem: expect.any(Function),
        setItem: expect.any(Function),
      }))
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        store,
        meta: {},
        collection,
        mutation: 'create',
        item: { name: 'From before hook' },
      }))
      expect(createItem).not.toHaveBeenCalled()
      expect(afterMutation).toHaveBeenCalledWith(expect.objectContaining({
        store,
        meta: {},
        collection,
        mutation: 'create',
        getResult: expect.any(Function),
        setResult: expect.any(Function),
      }))
      expect(applyMutation).toHaveBeenCalledWith(expect.objectContaining({
        collection,
        mutation: 'create',
        result: { id: 2, name: 'Changed' },
        meta: {},
      }))
      expect(store.$mutationHistory).toContainEqual({
        operation: 'create',
        collection,
        key: 2,
        payload: { name: 'From before hook' },
      })
    })

    it('should run many hooks and apply many deletes', async () => {
      const applyResult = { written: [], deleted: [1, 2], skipped: 0 }
      const applyMutation = vi.fn((_params: any) => applyResult)
      const beforeManyMutation = vi.fn()
      const afterManyMutation = vi.fn()
      const deleteMany = vi.fn()
      const callback = vi.fn()

      options.schema = [{ name: 'messages' }]
      options.cache = { applyMutation } as unknown as Cache
      options.hooks = createHooks()
      options.hooks.hook('beforeManyMutation', beforeManyMutation)
      options.hooks.hook('afterManyMutation', afterManyMutation)
      options.hooks.hook('deleteMany', deleteMany)

      const store = await createStoreCore(options)
      const collection = store.$collections[0]!
      const result = await store.$mutate({
        collection,
        mutation: 'delete',
        keys: [1, 2],
      }, callback)

      expect(result).toBeUndefined()
      expect(beforeManyMutation).toHaveBeenCalledWith(expect.objectContaining({
        collection,
        mutation: 'delete',
        keys: [1, 2],
      }))
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        collection,
        mutation: 'delete',
        keys: [1, 2],
      }))
      expect(deleteMany).not.toHaveBeenCalled()
      expect(afterManyMutation).toHaveBeenCalledWith(expect.objectContaining({
        store,
        meta: {},
        collection,
        mutation: 'delete',
        keys: [1, 2],
        getResult: expect.any(Function),
        setResult: expect.any(Function),
      }))
      expect(applyMutation).toHaveBeenCalledWith(expect.objectContaining({
        collection,
        mutation: 'delete',
        keys: [1, 2],
        meta: {},
      }))
      expect(store.$mutationHistory).toContainEqual({
        operation: 'delete',
        collection,
        keys: [1, 2],
        payload: undefined,
      })
    })

    it('should pass hook-modified items to the callback in many mode', async () => {
      const applyResult = { written: [1], deleted: [], skipped: 0 }
      const applyMutation = vi.fn((_params: any) => applyResult)
      const callback = vi.fn(({ items }) => items.map((entry: any) => ({ ...(entry.item ?? entry), saved: true })))

      options.schema = [{ name: 'messages' }]
      options.cache = { applyMutation } as unknown as Cache
      options.hooks = createHooks()
      options.hooks.hook('beforeManyMutation', ({ setItems }) => {
        setItems([{ id: 1, name: 'Changed by before hook' }])
      })

      const store = await createStoreCore(options)
      const collection = store.$collections[0]!
      const result = await store.$mutate({
        collection,
        mutation: 'update',
        items: [{ id: 1, name: 'Original' }],
      }, callback)

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        items: [{ id: 1, name: 'Changed by before hook' }],
      }))
      expect(result).toEqual([{ id: 1, name: 'Changed by before hook', saved: true }])
      expect(applyMutation).toHaveBeenCalledWith(expect.objectContaining({
        results: [{ id: 1, name: 'Changed by before hook', saved: true }],
      }))
    })

    it('should emit hooks and history without applying cache when skipCache is true', async () => {
      const applyMutation = vi.fn()
      const afterMutation = vi.fn()

      options.schema = [{ name: 'messages' }]
      options.cache = { applyMutation } as unknown as Cache
      options.hooks = createHooks()
      options.hooks.hook('afterMutation', afterMutation)

      const store = await createStoreCore(options)
      const collection = store.$collections[0]!
      const result = await store.$mutate({
        collection,
        mutation: 'create',
        skipCache: true,
      }, () => ({ id: 1, name: 'Skipped' }))

      expect(result).toEqual({ id: 1, name: 'Skipped' })
      expect(afterMutation).toHaveBeenCalled()
      expect(applyMutation).not.toHaveBeenCalled()
      expect(store.$mutationHistory).toContainEqual({
        operation: 'create',
        collection,
        key: 1,
        payload: undefined,
      })
    })

    it('should skip after hooks, cache, and history when the callback throws', async () => {
      const applyMutation = vi.fn()
      const afterMutation = vi.fn()

      options.schema = [{ name: 'messages' }]
      options.cache = { applyMutation } as unknown as Cache
      options.hooks = createHooks()
      options.hooks.hook('afterMutation', afterMutation)

      const store = await createStoreCore(options)
      const collection = store.$collections[0]!

      await expect(store.$mutate({
        collection,
        mutation: 'create',
      }, async () => {
        throw new Error('custom failed')
      })).rejects.toThrow('custom failed')

      expect(afterMutation).not.toHaveBeenCalled()
      expect(applyMutation).not.toHaveBeenCalled()
      expect(store.$mutationHistory).toEqual([])
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

  describe('sync', () => {
    /**
     * Create a window global stub exposing a localStorage backed by a Map.
     */
    function stubWindowLocalStorage() {
      const storage = new Map<string, string>()
      vi.stubGlobal('window', {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, String(value))
          },
          removeItem: (key: string) => {
            storage.delete(key)
          },
        },
      })
      return storage
    }

    beforeEach(() => {
      options.hooks = createHooks()
      options.syncImmediately = false
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('should persist lastSyncAt and parse it back across a simulated reload', async () => {
      const storage = stubWindowLocalStorage()

      const store = await createStoreCore(options)
      await store.$sync()

      expect(store.$syncState.error).toBeUndefined()
      expect(store.$syncState.lastSyncAt).toBeInstanceOf(Date)
      expect(storage.get('rstore-last-sync-at')).toBe(store.$syncState.lastSyncAt!.toISOString())

      // Simulated reload: a new store reads the persisted value back
      const reloadedStore = await createStoreCore({ ...options, hooks: createHooks() })
      expect(reloadedStore.$syncState.lastSyncAt).toBeInstanceOf(Date)
      expect(Number.isNaN(reloadedStore.$syncState.lastSyncAt!.getTime())).toBe(false)
      expect(reloadedStore.$syncState.lastSyncAt!.getTime()).toBe(store.$syncState.lastSyncAt!.getTime())
    })

    it('should parse legacy epoch-ms persisted values', async () => {
      const storage = stubWindowLocalStorage()
      const date = new Date('2023-01-01T00:00:00Z')
      storage.set('rstore-last-sync-at', String(date.getTime()))

      const store = await createStoreCore(options)

      expect(store.$syncState.lastSyncAt).toBeInstanceOf(Date)
      expect(store.$syncState.lastSyncAt!.getTime()).toBe(date.getTime())
    })

    it('should not fail in non-browser contexts', async () => {
      // No window global in the node test environment
      expect(typeof window).toBe('undefined')

      const store = await createStoreCore(options)
      await store.$sync()

      expect(store.$syncState.error).toBeUndefined()
      expect(store.$syncState.lastSyncAt).toBeInstanceOf(Date)
    })

    it('should not run sync callbacks twice for concurrent $sync calls', async () => {
      const syncCallback = vi.fn(async () => {
        // Simulate an async sync operation spanning multiple ticks
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      options.hooks.hook('sync', syncCallback)

      const store = await createStoreCore(options)

      const promise1 = store.$sync()
      const promise2 = store.$sync()

      // The second call returns the in-flight promise instead of re-running
      expect(promise2).toBe(promise1)
      await Promise.all([promise1, promise2])
      expect(syncCallback).toHaveBeenCalledTimes(1)

      // A new sync can run once the previous one settled
      await store.$sync()
      expect(syncCallback).toHaveBeenCalledTimes(2)
    })
  })
})
