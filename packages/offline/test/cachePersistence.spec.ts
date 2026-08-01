import { beforeEach, describe, expect, it } from 'vitest'
import { installMutationHooks } from '../src/plugin/mutations'
import { createCollection, createHookCollector, createRuntime } from './utils/plugin'

// The offline cache mirrors every committed mutation into IndexedDB. If a
// mutation is not mirrored the local database silently diverges from the
// server: deleted rows keep showing up offline, and partial update responses
// wipe fields the server never sent back.

describe('offline cache persistence', () => {
  let collector: ReturnType<typeof createHookCollector>
  let runtime: ReturnType<typeof createRuntime>['runtime']
  let db: ReturnType<typeof createRuntime>['db']
  let collection: any

  beforeEach(() => {
    collector = createHookCollector()
    const created = createRuntime()
    runtime = created.runtime
    db = created.db
    collection = createCollection()
    installMutationHooks(runtime, collector.hook)
  })

  /** Builds an `afterMutation` payload with the fields core actually provides. */
  function payload(overrides: Record<string, any>) {
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

      await collector.run('afterMutation', payload({ mutation: 'delete', key: '1' }))

      expect(db.deleteItem).toHaveBeenCalledWith('Todos', '1')
      expect(db.stores.get('Todos')!.has('1')).toBe(false)
    })

    it('falls back to deriving the key from the item', async () => {
      await collector.run('afterMutation', payload({ mutation: 'delete', item: { id: '2' } }))

      expect(db.deleteItem).toHaveBeenCalledWith('Todos', '2')
    })

    it('does nothing when neither a key nor an item is available', async () => {
      await collector.run('afterMutation', payload({ mutation: 'delete' }))

      expect(db.deleteItem).not.toHaveBeenCalled()
    })
  })

  describe('create', () => {
    it('writes the result', async () => {
      const result = { id: '1', text: 'a' }

      await collector.run('afterMutation', payload({ mutation: 'create', getResult: () => result }))

      expect(db.writeItem).toHaveBeenCalledWith('Todos', '1', result)
    })

    it('skips when the mutation produced no result', async () => {
      await collector.run('afterMutation', payload({ mutation: 'create' }))

      expect(db.writeItem).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('merges a partial result over the cached item', async () => {
      // Update responses may only contain the changed columns; overwriting
      // would drop everything the server left out.
      db.stores.set('Todos', new Map([['1', { id: '1', text: 'a', done: false }]]))

      await collector.run('afterMutation', payload({
        mutation: 'update',
        key: '1',
        getResult: () => ({ id: '1', done: true }),
      }))

      expect(db.stores.get('Todos')!.get('1')).toEqual({ id: '1', text: 'a', done: true })
    })

    it('writes the result as-is when nothing is cached yet', async () => {
      const result = { id: '1', done: true }

      await collector.run('afterMutation', payload({ mutation: 'update', key: '1', getResult: () => result }))

      expect(db.stores.get('Todos')!.get('1')).toEqual(result)
    })
  })

  describe('key resolution', () => {
    it('falls back to the payload key when the result carries no key fields', async () => {
      collection = createCollection('Todos', () => undefined)
      const result = { text: 'a' }

      await collector.run('afterMutation', payload({ mutation: 'create', collection, key: '7', getResult: () => result }))

      expect(db.writeItem).toHaveBeenCalledWith('Todos', '7', result)
    })

    it('persists a falsy but valid key', async () => {
      const result = { id: 0, text: 'a' }

      await collector.run('afterMutation', payload({ mutation: 'create', getResult: () => result }))

      expect(db.writeItem).toHaveBeenCalledWith('Todos', '0', result)
    })

    it('skips when no key can be resolved at all', async () => {
      collection = createCollection('Todos', () => undefined)

      await collector.run('afterMutation', payload({ mutation: 'create', collection, getResult: () => ({ text: 'a' }) }))

      expect(db.writeItem).not.toHaveBeenCalled()
    })
  })

  it('ignores collections excluded by the plugin filter', async () => {
    const excluded = createRuntime({ options: { filterCollection: () => false } })
    const excludedCollector = createHookCollector()
    installMutationHooks(excluded.runtime, excludedCollector.hook)

    await excludedCollector.run('afterMutation', payload({ mutation: 'delete', key: '1' }))
    await excludedCollector.run('afterMutation', payload({ mutation: 'create', getResult: () => ({ id: '1' }) }))

    expect(excluded.db.deleteItem).not.toHaveBeenCalled()
    expect(excluded.db.writeItem).not.toHaveBeenCalled()
  })
})
