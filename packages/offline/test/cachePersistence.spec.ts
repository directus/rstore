import { resolveCollection } from '@rstore/core'
import { createHooks } from '@rstore/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { installMutationHooks } from '../src/plugin/mutations'
import { createRuntime } from './utils/plugin'

// The offline cache mirrors every committed mutation into IndexedDB. If a
// mutation is not mirrored the local database silently diverges from the
// server: deleted rows keep showing up offline, and partial update responses
// wipe fields the server never sent back.

describe('offline cache persistence', () => {
  let hooks: ReturnType<typeof createHooks>
  let runtime: ReturnType<typeof createRuntime>['runtime']
  let db: ReturnType<typeof createRuntime>['db']
  let collection: any

  beforeEach(() => {
    hooks = createHooks()
    const created = createRuntime()
    runtime = created.runtime
    db = created.db
    collection = resolveCollection({ name: 'Todos' }, undefined)
    installMutationHooks(runtime, hooks.hook.bind(hooks))
  })

  /** Builds an `afterMutation` payload with the fields core actually provides. */
  function payload(overrides: Record<string, any>): any {
    return {
      collection,
      getResult: () => undefined,
      ...overrides,
    }
  }

  describe('delete', () => {
    it('removes the cached item using the key from the payload', async () => {
      // Core emits deletes with a `key` and no result at all, so the handler
      // cannot go looking for one.
      db.stores.set('Todos', new Map([['1', { id: '1', text: 'a' }]]))

      await hooks.callHook('afterMutation', payload({ mutation: 'delete', key: '1' }))

      expect(db.deleteItem).toHaveBeenCalledWith('Todos', '1')
      expect(db.stores.get('Todos')!.has('1')).toBe(false)
    })

    it('falls back to deriving the key from the item', async () => {
      await hooks.callHook('afterMutation', payload({ mutation: 'delete', item: { id: '2' } }))

      expect(db.deleteItem).toHaveBeenCalledWith('Todos', '2')
    })

    it('does nothing when neither a key nor an item is available', async () => {
      await hooks.callHook('afterMutation', payload({ mutation: 'delete' }))

      expect(db.deleteItem).not.toHaveBeenCalled()
    })
  })

  describe('create', () => {
    it('writes the result', async () => {
      const result = { id: '1', text: 'a' }

      await hooks.callHook('afterMutation', payload({ mutation: 'create', getResult: () => result }))

      expect(db.writeItem).toHaveBeenCalledWith('Todos', '1', { id: '1', text: 'a' })
    })

    it('skips when the mutation produced no result', async () => {
      await hooks.callHook('afterMutation', payload({ mutation: 'create' }))

      expect(db.writeItem).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('merges a partial result over the cached item', async () => {
      // Update responses may only contain the changed columns; overwriting
      // would drop everything the server left out.
      db.stores.set('Todos', new Map([['1', { id: '1', text: 'a', done: false }]]))

      await hooks.callHook('afterMutation', payload({
        mutation: 'update',
        key: '1',
        getResult: () => ({ id: '1', done: true }),
      }))

      expect(db.stores.get('Todos')!.get('1')).toEqual({ id: '1', text: 'a', done: true })
    })

    it('writes the result as-is when nothing is cached yet', async () => {
      const result = { id: '1', done: true }

      await hooks.callHook('afterMutation', payload({ mutation: 'update', key: '1', getResult: () => result }))

      expect(db.stores.get('Todos')!.get('1')).toEqual({ id: '1', done: true })
    })
  })

  describe('key resolution', () => {
    it('falls back to the payload key when the result carries no key fields', async () => {
      const result = { text: 'a' }

      await hooks.callHook('afterMutation', payload({ mutation: 'create', collection, key: '7', getResult: () => result }))

      expect(db.writeItem).toHaveBeenCalledWith('Todos', '7', { text: 'a' })
    })

    it('persists a falsy but valid key', async () => {
      const result = { id: 0, text: 'a' }

      await hooks.callHook('afterMutation', payload({ mutation: 'create', getResult: () => result }))

      expect(db.writeItem).toHaveBeenCalledWith('Todos', '0', { id: 0, text: 'a' })
    })

    it('skips when no key can be resolved at all', async () => {
      await hooks.callHook('afterMutation', payload({ mutation: 'create', collection, getResult: () => ({ text: 'a' }) }))

      expect(db.writeItem).not.toHaveBeenCalled()
    })
  })

  it('persists selected collection mutations while preserving excluded rows', async () => {
    const filtered = createRuntime({ options: { filterCollection: collection => collection.name === 'Todos' } })
    const filteredHooks = createHooks()
    installMutationHooks(filtered.runtime, filteredHooks.hook.bind(filteredHooks))
    const notes = resolveCollection({ name: 'Notes' }, undefined)
    filtered.db.stores.set('Todos', new Map([['old', { id: 'old', text: 'replace' }]]))
    filtered.db.stores.set('Notes', new Map([['old', { id: 'old', text: 'private' }]]))

    for (const selected of [collection, notes]) {
      await filteredHooks.callHook('afterMutation', payload({ collection: selected, mutation: 'delete', key: 'old' }))
      await filteredHooks.callHook('afterMutation', payload({ collection: selected, mutation: 'create', getResult: () => ({ id: 'new', text: 'saved' }) }))
    }

    expect(filtered.db.deleteItem.mock.calls).toEqual([['Todos', 'old']])
    expect(filtered.db.writeItem.mock.calls).toEqual([['Todos', 'new', { id: 'new', text: 'saved' }]])
    expect(filtered.db.stores.get('Todos')).toEqual(new Map([['new', { id: 'new', text: 'saved' }]]))
    expect(filtered.db.stores.get('Notes')).toEqual(new Map([['old', { id: 'old', text: 'private' }]]))
  })

  describe('many mutations', () => {
    it('persists queued createMany results when core skips per-item afterMutation hooks', async () => {
      // Offline queue hooks abort many mutations after setting the queued
      // result, so core reaches afterManyMutation without emitting the normal
      // per-item afterMutation hooks.
      await hooks.callHook('afterManyMutation', {
        meta: {},
        collection,
        mutation: 'create',
        items: [
          { key: 'b', item: { id: 'b', text: 'B' } },
          { key: 'c', item: { id: 'c', text: 'C' } },
        ],
        getResult: () => [
          { id: 'b', text: 'B' },
          { id: 'c', text: 'C' },
        ],
      } as any)

      expect(db.stores.get('Todos')).toEqual(new Map([
        ['b', { id: 'b', text: 'B' }],
        ['c', { id: 'c', text: 'C' }],
      ]))
    })

    it('persists queued deleteMany keys when no item results exist', async () => {
      db.stores.set('Todos', new Map([
        ['b', { id: 'b' }],
        ['c', { id: 'c' }],
      ]))

      await hooks.callHook('afterManyMutation', {
        meta: {},
        collection,
        mutation: 'delete',
        keys: ['b', 'c'],
        getResult: () => [],
      } as any)

      expect(db.stores.get('Todos')!.size).toBe(0)
    })

    it('skips afterManyMutation when core already emitted per-item hooks', async () => {
      const meta = {}
      await hooks.callHook('afterMutation', payload({
        meta,
        mutation: 'create',
        getResult: () => ({ id: 'b', text: 'B' }),
      }))
      db.writeItem.mockClear()

      await hooks.callHook('afterManyMutation', {
        meta,
        collection,
        mutation: 'create',
        items: [{ key: 'b', item: { id: 'b', text: 'B' } }],
        getResult: () => [{ id: 'b', text: 'B' }],
      } as any)

      expect(db.writeItem).not.toHaveBeenCalled()
    })
  })
})
