import { beforeEach, describe, expect, it } from 'vitest'
import {
  createFormOp,
  createMockClient,
  createProfilesCollection,
  createRelationStore,
  createTodosCollection,
  runHook,
  setupPlugin,
  withConnectKeys,
} from './utils/plugin'

const client = createMockClient()

beforeEach(() => {
  for (const fn of Object.values(client)) {
    fn.mockReset()
  }
})

describe('createMonospaceRstorePlugin non-PK join columns', () => {
  /**
   * Todos whose author FK references the non-PK `Profiles.email` column, as
   * resolved from the FK constraint in the schema metadata.
   */
  function createEmailJoinedTodosCollection(): any {
    const collection = createTodosCollection()
    collection.normalizedRelations.author.to[0].on = { email: 'author_id' }
    return collection
  }

  it('writes the FK column from the referenced email column on create', async () => {
    const hooks = setupPlugin(client)
    const collection = createEmailJoinedTodosCollection()
    client.createOne.mockResolvedValueOnce({ id: 5, title: 'A', author_id: 'jane@acme.dev' })

    const result: any = await runHook(hooks.createItem, {
      collection,
      store: createRelationStore({ collections: [collection, createProfilesCollection()] }),
      item: { title: 'A' },
      formOperations: [createFormOp('author', 'connect', { id: 'p1', email: 'jane@acme.dev' })],
    })

    // The FK column stores the referenced (email) value.
    expect(client.createOne).toHaveBeenCalledWith('Todos', {
      title: 'A',
      author_id: 'jane@acme.dev',
    }, {})
    expect(result).toEqual({ id: 5, title: 'A', author_id: 'jane@acme.dev' })
  })

  it('writes the FK column from the referenced email column on update', async () => {
    const hooks = setupPlugin(client)
    const collection = createEmailJoinedTodosCollection()
    client.updateOne.mockResolvedValueOnce({ id: 1, title: 'A', author_id: 'jane@acme.dev' })

    await runHook(hooks.updateItem, {
      collection,
      store: createRelationStore({ collections: [collection, createProfilesCollection()] }),
      key: 1,
      item: { id: 1 },
      formOperations: [createFormOp('author', 'connect', { id: 'p1', email: 'jane@acme.dev' })],
    })

    expect(client.updateOne).toHaveBeenCalledWith('Todos', 1, {
      author_id: 'jane@acme.dev',
    }, {})
  })

  it('resolves missing referenced columns from the cache', async () => {
    const hooks = setupPlugin(client)
    const collection = createEmailJoinedTodosCollection()
    const store = createRelationStore({
      collections: [collection, createProfilesCollection()],
      cacheItems: {
        Profiles: [{ id: 'p1', name: 'Jane', email: 'jane@acme.dev' }],
      },
    })
    client.createOne.mockResolvedValueOnce({ id: 5, title: 'A' })

    // The connected item is only known by its primary key; the referenced
    // email column is recovered from the cached Profiles item.
    await runHook(hooks.createItem, {
      collection,
      store,
      item: { title: 'A' },
      formOperations: [createFormOp('author', 'connect', { id: 'p1' })],
    })

    expect(client.createOne).toHaveBeenCalledWith('Todos', {
      title: 'A',
      author_id: 'jane@acme.dev',
    }, {})
  })

  it('throws when the referenced columns cannot be resolved', async () => {
    const hooks = setupPlugin(client)
    const collection = createEmailJoinedTodosCollection()

    await expect(runHook(hooks.createItem, {
      collection,
      store: createRelationStore({ collections: [collection, createProfilesCollection()] }),
      item: { title: 'A' },
      formOperations: [createFormOp('author', 'connect', { id: 'p1' })],
    })).rejects.toThrow(/email/)
    expect(client.createOne).not.toHaveBeenCalled()
  })

  it('uses connect key metadata for to-many keys', async () => {
    const hooks = setupPlugin(client)
    const collection = withConnectKeys(createProfilesCollection(), 'todos', ['uuid'])
    const store = createRelationStore({ collections: [createTodosCollection(), collection] })
    client.updateOne.mockResolvedValueOnce({ id: 'p1', name: 'Jane' })

    await runHook(hooks.updateItem, {
      collection,
      store,
      key: 'p1',
      item: {},
      formOperations: [createFormOp('todos', 'connect', { id: 3, uuid: 'u3' })],
    })

    expect(client.updateOne).toHaveBeenCalledWith('Profiles', 'p1', {
      todos: [{ _connect: { keys: [{ uuid: 'u3' }] } }],
    }, {})
    // Cache reconciliation still keys the FK column patch by PK.
    expect(store.$cache.writeItem).toHaveBeenCalledWith({
      collection: expect.objectContaining({ name: 'Todos' }),
      key: 3,
      item: { id: 3, author_id: 'p1' },
    })
  })

  it('skips to-many cache patches when the connected item is only known by connect keys', async () => {
    const hooks = setupPlugin(client)
    const profiles = withConnectKeys(createProfilesCollection(), 'todos', ['uuid'])
    const store = createRelationStore({ collections: [createTodosCollection(), profiles] })
    client.updateOne.mockResolvedValueOnce({ id: 'p1', name: 'Jane' })

    // The target primary key is unknown, so no FK column patch is written.
    await runHook(hooks.updateItem, {
      collection: profiles,
      store,
      key: 'p1',
      item: {},
      formOperations: [createFormOp('todos', 'connect', { uuid: 'u9' })],
    })
    expect(client.updateOne).toHaveBeenCalledWith('Profiles', 'p1', {
      todos: [{ _connect: { keys: [{ uuid: 'u9' }] } }],
    }, {})
    expect(store.$cache.writeItem).not.toHaveBeenCalled()
  })
})
