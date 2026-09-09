import type { CreateStoreCoreOptions } from '@rstore/core'
import type { Cache, CollectionDefaults, StoreSchema } from '@rstore/shared'
import { createVueStack } from '#test-utils/store/vueStack'
import { stubWindow } from '#test-utils/store/windowStub'
import { createStoreCore } from '@rstore/core'
import { createHooks } from '@rstore/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('createStoreCore', () => {
  let options: Omit<CreateStoreCoreOptions, 'cache'>
  let cache: Cache

  beforeEach(() => {
    options = {
      schema: [] as StoreSchema,
      collectionDefaults: {} as CollectionDefaults,
      plugins: [],
      hooks: createHooks(),
      findDefaults: {},
      syncImmediately: false,
    }
  })

  /** Supply a real cache with matching schema; storage workflows use the normal stack. */
  async function createSubject() {
    const donor = await createVueStack({ schema: options.schema, remote: false, tombstoneGc: false, syncImmediately: false })
    cache = donor.cache
    return createStoreCore({ ...options, cache })
  }

  it('exposes resolved defaults and caller-owned dependencies', async () => {
    const store = await createSubject()

    expect(store.$cache).toBe(cache)
    expect(store.$collections).toEqual([])
    expect(store.$collectionDefaults).toEqual({})
    expect(store.$plugins.filter(plugin => !plugin.meta?.builtin)).toEqual([])
    expect(store.$hooks).toBe(options.hooks)
    expect(store.$findDefaults).toEqual({})
  })

  it('sets up plugins in registration order', async () => {
    const setupOrder: string[] = []
    options.plugins = [
      { name: 'first', setup: () => void setupOrder.push('first') },
      { name: 'second', setup: () => void setupOrder.push('second') },
    ]

    await createSubject()

    expect(setupOrder).toEqual(['first', 'second'])
  })

  it('publishes resolved collections and plugin field defaults before init', async () => {
    const pluginParse = (value: string) => `plugin:${value}`
    let collectionsAtInit: string[] = []
    let fieldParseAtInit: unknown
    options.schema = [{ name: 'todos' }]
    options.plugins = [{
      name: 'probe',
      setup: ({ hook, addCollectionDefaults }) => {
        addCollectionDefaults({ fields: { title: { parse: pluginParse } } })
        hook('init', ({ store }) => {
          collectionsAtInit = store.$collections.map(collection => collection.name)
          fieldParseAtInit = store.$collections[0]?.fields?.title?.parse
        })
      },
    }]

    await createSubject()

    expect(collectionsAtInit).toEqual(['todos'])
    expect(fieldParseAtInit).toBe(pluginParse)
  })

  it('merges plugin field defaults without overriding collection fields or leaking them', async () => {
    const collectionParse = (value: unknown) => `collection:${value}`
    const pluginParse = (value: unknown) => `plugin:${value}`
    options.schema = [
      { name: 'messages', fields: { createdAt: { parse: collectionParse } } },
      { name: 'users' },
    ]
    options.collectionDefaults = {
      fields: { createdAt: { serialize: (value: Date) => value.toISOString() } },
    }
    options.plugins = [{
      name: 'field-defaults',
      setup: ({ addCollectionDefaults }) => {
        addCollectionDefaults({ fields: { createdAt: { parse: pluginParse } } })
      },
    }]

    const store = await createSubject()
    const messages = store.$collections.find(collection => collection.name === 'messages')!
    const users = store.$collections.find(collection => collection.name === 'users')!

    expect(messages.fields?.createdAt?.parse).toBe(collectionParse)
    expect(messages.fields?.createdAt?.serialize).toBeTypeOf('function')
    expect(users.fields?.createdAt?.parse).toBe(pluginParse)
    expect(users.fields?.createdAt?.serialize).toBeTypeOf('function')
  })

  it('matches items to collections and honors explicit search scope', async () => {
    options.schema = [
      { name: 'users', isInstanceOf: (item: any) => 'username' in item },
      { name: 'staff', isInstanceOf: (item: any) => 'username' in item },
      { name: 'bots', isInstanceOf: (item: any) => 'botname' in item },
    ]
    const store = await createSubject()

    expect(store.$getCollection({ username: 'Ada' })).toBe(store.$collections[0])
    expect(store.$getCollection({ username: 'Ada' }, ['staff', 'bots'])).toBe(store.$collections[1])
    expect(store.$getCollection({ unknown: true })).toBeNull()
    expect(store.$getCollection({ unknown: true }, ['bots'])).toBe(store.$collections[2])
  })

  describe('$sync', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('persists lastSyncAt and restores it in a new store', async () => {
      const { storage } = stubWindow()
      const store = await createSubject()

      await store.$sync()

      expect(store.$syncState.lastSyncAt).toBeInstanceOf(Date)
      expect(storage.get('rstore-last-sync-at')).toBe(store.$syncState.lastSyncAt?.toISOString())

      const reloaded = await createStoreCore({ ...options, cache, plugins: [], hooks: createHooks() })
      expect(reloaded.$syncState.lastSyncAt?.getTime()).toBe(store.$syncState.lastSyncAt?.getTime())
    })

    it('restores legacy epoch milliseconds', async () => {
      const { storage } = stubWindow()
      const date = new Date('2023-01-01T00:00:00Z')
      storage.set('rstore-last-sync-at', String(date.getTime()))

      const store = await createSubject()

      expect(store.$syncState.lastSyncAt?.getTime()).toBe(date.getTime())
    })

    it('works without a browser global', async () => {
      expect(typeof window).toBe('undefined')
      const store = await createSubject()

      await expect(store.$sync()).resolves.toBeUndefined()
      expect(store.$syncState.lastSyncAt).toBeInstanceOf(Date)
    })

    it('shares concurrent runs and allows a later run', async () => {
      const syncCallback = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      options.hooks.hook('sync', syncCallback)
      const store = await createSubject()

      const first = store.$sync()
      const second = store.$sync()

      expect(second).toBe(first)
      await Promise.all([first, second])
      expect(syncCallback).toHaveBeenCalledOnce()

      await store.$sync()
      expect(syncCallback).toHaveBeenCalledTimes(2)
    })
  })
})
