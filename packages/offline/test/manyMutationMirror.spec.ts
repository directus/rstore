import { createMany } from '@rstore/core'
import { createHooks } from '@rstore/shared'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIndexedDb } from '../src/indexeddb'
import { createOfflineRuntime } from '../src/plugin/metadata'
import { installMutationHooks } from '../src/plugin/mutations'
import { stubLocalStorage } from './utils/plugin'

describe('queued many-mutation mirror', () => {
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

  it('stores queued createMany rows after core skips per-item afterMutation hooks', async () => {
    const db = await useIndexedDb(dbName)
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

    await createMany({
      store: store as any,
      collection: collection as any,
      items: [
        { id: 'b', text: 'B' },
        { id: 'c', text: 'C' },
      ],
      skipCache: true,
    })

    expect(await db.readAllItems('Todos')).toEqual([
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
    ])
    await db.dispose()
  })
})
