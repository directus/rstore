import { createItem, createMany } from '@rstore/core'
import { createHooks } from '@rstore/shared'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIndexedDb } from '../src/indexeddb'
import { createOfflineRuntime } from '../src/plugin/metadata'
import { installMutationHooks } from '../src/plugin/mutations'
import { stubLocalStorage } from './utils/plugin'

const mutationCases = [
  {
    name: 'createItem',
    items: [{ id: 'a', text: 'A' }],
    queued: {
      type: 'create',
      collectionName: 'Todos',
      key: 'a',
      item: { id: 'a', text: 'A' },
    },
    run: async (store: any, collection: any) => {
      await createItem({
        store,
        collection,
        item: { id: 'a', text: 'A' },
        skipCache: true,
      })
    },
  },
  {
    name: 'createMany',
    items: [
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
    ],
    queued: {
      type: 'createMany',
      collectionName: 'Todos',
      keys: ['b', 'c'],
      items: [
        { id: 'b', text: 'B' },
        { id: 'c', text: 'C' },
      ],
    },
    run: async (store: any, collection: any) => {
      await createMany({
        store,
        collection,
        items: [
          { id: 'b', text: 'B' },
          { id: 'c', text: 'C' },
        ],
        skipCache: true,
      })
    },
  },
]

describe('queued mutation mirror', () => {
  let dbName: string

  beforeEach(() => {
    const indexedDb = new IDBFactory()
    dbName = `offline-many-${crypto.randomUUID()}`
    vi.stubGlobal('indexedDB', indexedDb)
    vi.stubGlobal('window', { indexedDB: indexedDb })
    vi.stubGlobal('navigator', { onLine: false })
    stubLocalStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  for (const mutation of mutationCases) {
    it(`stores a queued ${mutation.name} and its local mirror`, async () => {
      const db = await useIndexedDb(dbName)
      try {
        const runtime = createOfflineRuntime({ dbName })
        runtime.db = db
        const hooks = createHooks()
        installMutationHooks(runtime, hooks.hook.bind(hooks))
        const collection = {
          name: 'Todos',
          getKey: (item: { id: string }) => item.id,
        }
        const store = {
          $hooks: hooks,
          $cache: {},
          $mutationHistory: [],
          $processItemParsing: () => {},
          $processItemSerialization: () => {},
        }

        await mutation.run(store, collection)

        expect(await db.readAllItems('Todos')).toEqual(mutation.items)
        expect(await db.readAllItems(runtime.opsStoreName)).toEqual([{
          id: expect.any(String),
          ...mutation.queued,
          time: expect.any(Date),
        }])
      }
      finally {
        await db.dispose()
      }
    })
  }
})
