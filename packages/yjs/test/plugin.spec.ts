import type { CollectionDefaults, HookDefinitions, Hooks, ResolvedCollection, StoreCore, StoreSchema } from '@rstore/shared'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createYjsPlugin } from '../src/plugin'

function createMockStore() {
  const hooks = createHooks<HookDefinitions<StoreSchema, CollectionDefaults>>()

  const cacheItems = new Map<string, Map<string | number, any>>()

  const store = {
    $hooks: hooks,
    $collections: [] as ResolvedCollection[],
    $cache: {
      writeItem: vi.fn(({ collection, key, item }: any) => {
        if (!cacheItems.has(collection.name)) {
          cacheItems.set(collection.name, new Map())
        }
        cacheItems.get(collection.name)!.set(key, { ...item })
      }),
      deleteItem: vi.fn(({ collection, key }: any) => {
        cacheItems.get(collection.name)?.delete(key)
      }),
      readItem: vi.fn(({ collection, key }: any) => {
        return cacheItems.get(collection.name)?.get(key)
      }),
    },
    $processItemParsing: vi.fn(),
    $processItemSerialization: vi.fn(),
    $collectionDefaults: {} as CollectionDefaults,
    $mutationHistory: [],
    $plugins: [],
  } as unknown as StoreCore<StoreSchema, CollectionDefaults>

  return { store, hooks, cacheItems }
}

function createMockCollection(name: string): ResolvedCollection {
  return {
    name,
    getKey: (item: any) => item.id,
    isInstanceOf: () => () => true,
    relations: {},
    normalizedRelations: {},
    oppositeRelations: {},
    indexes: new Map(),
    computed: {},
    formSchema: {} as any,
  } as unknown as ResolvedCollection
}

describe('createYjsPlugin', () => {
  let ydoc: Y.Doc
  let store: StoreCore<StoreSchema, CollectionDefaults>
  let hooks: Hooks<StoreSchema, CollectionDefaults>
  let collection: ResolvedCollection

  beforeEach(() => {
    ydoc = new Y.Doc()
    const mock = createMockStore()
    store = mock.store
    hooks = mock.hooks
    collection = createMockCollection('posts')
    ;(store as any).$collections = [collection]
  })

  it('should create a plugin with name "yjs"', () => {
    const plugin = createYjsPlugin({ doc: ydoc })
    expect(plugin.name).toBe('yjs')
    expect(plugin.category).toBe('remote')
  })

  describe('init hook', () => {
    it('should hydrate cache from existing Yjs state', async () => {
      // Pre-populate Yjs doc with data
      const postsMap = ydoc.getMap('rstore:posts') as Y.Map<Y.Map<any>>
      const itemMap = new Y.Map()
      itemMap.set('id', '1')
      itemMap.set('title', 'Hello')
      itemMap.set('content', 'World')
      postsMap.set('1', itemMap as any)

      const plugin = createYjsPlugin({ doc: ydoc })
      plugin.setup({
        hook: (name: any, callback: any) => {
          hooks.hook(name, callback as any)
          return () => {}
        },
        addCollectionDefaults: vi.fn(),
      })

      await hooks.callHook('init', {
        store: store as any,
        meta: {},
      })

      expect(store.$cache.writeItem).toHaveBeenCalledWith(
        expect.objectContaining({
          collection,
          key: 1, // '1' gets deserialized to number
          item: expect.objectContaining({
            id: '1',
            title: 'Hello',
            content: 'World',
          }),
        }),
      )
    })

    it('should use custom prefix', async () => {
      const postsMap = ydoc.getMap('custom:posts') as Y.Map<Y.Map<any>>
      const itemMap = new Y.Map()
      itemMap.set('id', 'a')
      itemMap.set('title', 'Test')
      postsMap.set('a', itemMap as any)

      const plugin = createYjsPlugin({ doc: ydoc, prefix: 'custom:' })
      plugin.setup({
        hook: (name: any, callback: any) => {
          hooks.hook(name, callback as any)
          return () => {}
        },
        addCollectionDefaults: vi.fn(),
      })

      await hooks.callHook('init', {
        store: store as any,
        meta: {},
      })

      expect(store.$cache.writeItem).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'a',
          item: expect.objectContaining({ title: 'Test' }),
        }),
      )
    })

    it('should skip filtered-out collections', async () => {
      const plugin = createYjsPlugin({
        doc: ydoc,
        filterCollection: c => c.name !== 'posts',
      })
      plugin.setup({
        hook: (name: any, callback: any) => {
          hooks.hook(name, callback as any)
          return () => {}
        },
        addCollectionDefaults: vi.fn(),
      })

      await hooks.callHook('init', {
        store: store as any,
        meta: {},
      })

      // No Y.Map observers should have been attached
      expect(store.$cache.writeItem).not.toHaveBeenCalled()
    })
  })

  describe('afterMutation hook - local → Yjs', () => {
    function setupPlugin() {
      const plugin = createYjsPlugin({ doc: ydoc })
      plugin.setup({
        hook: (name: any, callback: any) => {
          hooks.hook(name, callback as any)
          return () => {}
        },
        addCollectionDefaults: vi.fn(),
      })
    }

    it('should write created item to Yjs', async () => {
      setupPlugin()

      await hooks.callHook('init', { store: store as any, meta: {} })

      const newItem = { id: '42', title: 'New Post', body: 'Content' }

      await hooks.callHook('afterMutation', {
        store: store as any,
        meta: {},
        collection,
        mutation: 'create',
        key: '42',
        item: newItem,
        getResult: () => newItem as any,
        setResult: vi.fn(),
      })

      const postsMap = ydoc.getMap('rstore:posts') as Y.Map<Y.Map<any>>
      const itemMap = postsMap.get('42')
      expect(itemMap).toBeDefined()
      expect(itemMap!.get('title')).toBe('New Post')
      expect(itemMap!.get('body')).toBe('Content')
    })

    it('should update existing item in Yjs', async () => {
      setupPlugin()

      // First create the item
      const postsMap = ydoc.getMap('rstore:posts') as Y.Map<Y.Map<any>>
      const itemMap = new Y.Map()
      itemMap.set('id', '1')
      itemMap.set('title', 'Old')
      postsMap.set('1', itemMap as any)

      await hooks.callHook('init', { store: store as any, meta: {} })

      const updatedItem = { id: '1', title: 'Updated' }

      await hooks.callHook('afterMutation', {
        store: store as any,
        meta: {},
        collection,
        mutation: 'update',
        key: '1',
        item: updatedItem,
        getResult: () => updatedItem as any,
        setResult: vi.fn(),
      })

      const updated = postsMap.get('1')
      expect(updated!.get('title')).toBe('Updated')
    })

    it('should delete item from Yjs', async () => {
      setupPlugin()

      const postsMap = ydoc.getMap('rstore:posts') as Y.Map<Y.Map<any>>
      const itemMap = new Y.Map()
      itemMap.set('id', '1')
      itemMap.set('title', 'To Delete')
      postsMap.set('1', itemMap as any)

      await hooks.callHook('init', { store: store as any, meta: {} })

      await hooks.callHook('afterMutation', {
        store: store as any,
        meta: {},
        collection,
        mutation: 'delete',
        key: '1',
        getResult: () => undefined,
        setResult: vi.fn(),
      })

      expect(postsMap.get('1')).toBeUndefined()
    })

    it('should handle nested objects as JSON strings', async () => {
      setupPlugin()
      await hooks.callHook('init', { store: store as any, meta: {} })

      const newItem = { id: '1', title: 'Post', metadata: { tags: ['a', 'b'], priority: 1 } }

      await hooks.callHook('afterMutation', {
        store: store as any,
        meta: {},
        collection,
        mutation: 'create',
        key: '1',
        item: newItem,
        getResult: () => newItem as any,
        setResult: vi.fn(),
      })

      const postsMap = ydoc.getMap('rstore:posts') as Y.Map<Y.Map<any>>
      const itemMap = postsMap.get('1')
      // Nested object should be stored as JSON string
      const metaValue = itemMap!.get('metadata')
      expect(typeof metaValue).toBe('string')
      expect(JSON.parse(metaValue)).toEqual({ tags: ['a', 'b'], priority: 1 })
    })
  })

  describe('remote Yjs changes → cache', () => {
    function setupPlugin() {
      const plugin = createYjsPlugin({ doc: ydoc })
      plugin.setup({
        hook: (name: any, callback: any) => {
          hooks.hook(name, callback as any)
          return () => {}
        },
        addCollectionDefaults: vi.fn(),
      })
    }

    it('should update cache when remote Yjs item is added', async () => {
      setupPlugin()
      await hooks.callHook('init', { store: store as any, meta: {} })

      // Clear init-phase calls
      vi.mocked(store.$cache.writeItem).mockClear()

      // Simulate remote change
      const postsMap = ydoc.getMap('rstore:posts') as Y.Map<Y.Map<any>>
      const itemMap = new Y.Map()
      itemMap.set('id', 'remote-1')
      itemMap.set('title', 'Remote Post')
      postsMap.set('remote-1', itemMap as any)

      expect(store.$cache.writeItem).toHaveBeenCalledWith(
        expect.objectContaining({
          collection,
          key: 'remote-1',
          item: expect.objectContaining({
            id: 'remote-1',
            title: 'Remote Post',
          }),
        }),
      )
    })

    it('should update cache when remote Yjs item is deleted', async () => {
      // Pre-populate
      const postsMap = ydoc.getMap('rstore:posts') as Y.Map<Y.Map<any>>
      const itemMap = new Y.Map()
      itemMap.set('id', '1')
      itemMap.set('title', 'Existing')
      postsMap.set('1', itemMap as any)

      setupPlugin()
      await hooks.callHook('init', { store: store as any, meta: {} })

      vi.mocked(store.$cache.deleteItem).mockClear()

      // Delete
      postsMap.delete('1')

      expect(store.$cache.deleteItem).toHaveBeenCalledWith(
        expect.objectContaining({
          collection,
          key: 1,
        }),
      )
    })

    it('should update cache when a field on an existing Yjs item changes', async () => {
      // Pre-populate
      const postsMap = ydoc.getMap('rstore:posts') as Y.Map<Y.Map<any>>
      const itemMap = new Y.Map()
      itemMap.set('id', '1')
      itemMap.set('title', 'Original')
      postsMap.set('1', itemMap as any)

      setupPlugin()
      await hooks.callHook('init', { store: store as any, meta: {} })

      vi.mocked(store.$cache.writeItem).mockClear()

      // Update a field directly on the Y.Map
      itemMap.set('title', 'Changed remotely')

      expect(store.$cache.writeItem).toHaveBeenCalledWith(
        expect.objectContaining({
          collection,
          key: 1,
          item: expect.objectContaining({
            id: '1',
            title: 'Changed remotely',
          }),
        }),
      )
    })
  })

  describe('two Yjs peers syncing', () => {
    let ydoc2: Y.Doc

    beforeEach(() => {
      ydoc2 = new Y.Doc()
    })

    function syncDocs(docA: Y.Doc, docB: Y.Doc) {
      const stateA = Y.encodeStateAsUpdate(docA)
      const stateB = Y.encodeStateAsUpdate(docB)
      Y.applyUpdate(docA, stateB)
      Y.applyUpdate(docB, stateA)
    }

    it('should propagate items between two docs', async () => {
      const mock1 = createMockStore()
      const mock2 = createMockStore()
      ;(mock1.store as any).$collections = [collection]
      ;(mock2.store as any).$collections = [collection]

      const plugin1 = createYjsPlugin({ doc: ydoc })
      plugin1.setup({
        hook: (name: any, callback: any) => {
          mock1.hooks.hook(name, callback as any)
          return () => {}
        },
        addCollectionDefaults: vi.fn(),
      })

      const plugin2 = createYjsPlugin({ doc: ydoc2 })
      plugin2.setup({
        hook: (name: any, callback: any) => {
          mock2.hooks.hook(name, callback as any)
          return () => {}
        },
        addCollectionDefaults: vi.fn(),
      })

      await mock1.hooks.callHook('init', { store: mock1.store as any, meta: {} })
      await mock2.hooks.callHook('init', { store: mock2.store as any, meta: {} })

      // Create an item on doc1
      const newItem = { id: '1', title: 'Synced Post' }
      await mock1.hooks.callHook('afterMutation', {
        store: mock1.store as any,
        meta: {},
        collection,
        mutation: 'create',
        key: '1',
        item: newItem,
        getResult: () => newItem as any,
        setResult: vi.fn(),
      })

      // Sync the two docs
      syncDocs(ydoc, ydoc2)

      // doc2's cache should now have the item
      expect(mock2.store.$cache.writeItem).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 1,
          item: expect.objectContaining({
            title: 'Synced Post',
          }),
        }),
      )
    })
  })

  describe('afterManyMutation hook', () => {
    function setupPlugin() {
      const plugin = createYjsPlugin({ doc: ydoc })
      plugin.setup({
        hook: (name: any, callback: any) => {
          hooks.hook(name, callback as any)
          return () => {}
        },
        addCollectionDefaults: vi.fn(),
      })
    }

    it('should write multiple created items to Yjs', async () => {
      setupPlugin()
      await hooks.callHook('init', { store: store as any, meta: {} })

      const items = [
        { id: '1', title: 'First' },
        { id: '2', title: 'Second' },
      ]

      await hooks.callHook('afterManyMutation', {
        store: store as any,
        meta: {},
        collection,
        mutation: 'create',
        items: items.map(item => ({ key: item.id, item: item as any })),
        getResult: () => items as any,
        setResult: vi.fn(),
      })

      const postsMap = ydoc.getMap('rstore:posts') as Y.Map<Y.Map<any>>
      expect(postsMap.get('1')).toBeDefined()
      expect(postsMap.get('2')).toBeDefined()
      expect(postsMap.get('1')!.get('title')).toBe('First')
      expect(postsMap.get('2')!.get('title')).toBe('Second')
    })

    it('should delete multiple items from Yjs', async () => {
      setupPlugin()

      // Pre-populate
      const postsMap = ydoc.getMap('rstore:posts') as Y.Map<Y.Map<any>>
      for (const id of ['1', '2', '3']) {
        const m = new Y.Map()
        m.set('id', id)
        postsMap.set(id, m as any)
      }

      await hooks.callHook('init', { store: store as any, meta: {} })

      await hooks.callHook('afterManyMutation', {
        store: store as any,
        meta: {},
        collection,
        mutation: 'delete',
        keys: ['1', '3'],
        getResult: () => [],
        setResult: vi.fn(),
      })

      expect(postsMap.get('1')).toBeUndefined()
      expect(postsMap.get('2')).toBeDefined()
      expect(postsMap.get('3')).toBeUndefined()
    })
  })
})
