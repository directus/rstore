import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'
import { blogSchema } from '../garbage-collection/utils'

describe('public cache protocol', () => {
  it.each([10, 20, 30])('keeps relation reads consistent with a foreign-key write at timestamp %s', async (timestamp) => {
    const stack = await createVueStack({ schema: blogSchema, remote: false })
    stack.store.authors.writeItem({ id: 'a1' })
    stack.store.authors.writeItem({ id: 'a2' })
    const collection = stack.collection('posts')
    stack.cache.writeItem({ collection, key: 'p1', item: { id: 'p1', authorId: 'a1' }, fieldTimestamps: { authorId: 20 } })
    const first = stack.store.authors.peekFirst('a1')
    const second = stack.store.authors.peekFirst('a2')
    expect(first.posts.map((post: any) => post.id)).toEqual(['p1'])

    stack.cache.writeItem({ collection, key: 'p1', item: { id: 'p1', authorId: 'a2' }, fieldTimestamps: { authorId: timestamp } })

    expect(stack.store.posts.peekFirst('p1').authorId).toBe(timestamp > 20 ? 'a2' : 'a1')
    expect(first.posts.map((post: any) => post.id)).toEqual(timestamp > 20 ? [] : ['p1'])
    expect(second.posts.map((post: any) => post.id)).toEqual(timestamp > 20 ? ['p1'] : [])
  })

  it('merges timestamped fields and publishes equal-timestamp conflicts to consumers', async () => {
    const stack = await createVueStack({ schema: [{ name: 'notes' }], remote: false })
    const collection = stack.collection('notes')
    const conflicts: unknown[] = []
    stack.store.$hooks.hook('cacheConflict', (event: { conflicts: unknown[] }) => conflicts.push(...event.conflicts))
    stack.cache.writeItem({ collection, key: '1', item: { id: '1', title: 'Local', body: 'Old body' }, fieldTimestamps: { title: 20, body: 10 } })
    const query = await stack.run(() => stack.store.notes.query((q: any) => q.first({ key: '1', fetchPolicy: 'cache-only' })))
    stack.cache.writeItem({ collection, key: '1', item: { id: '1', title: 'Stale', body: 'New body' }, fieldTimestamps: { title: 10, body: 30 } })
    expect(query.data.value).toMatchObject({ title: 'Local', body: 'New body' })
    expect(stack.cache.readFieldTimestamps({ collectionName: 'notes', key: '1' })).toMatchObject({ title: 20, body: 30 })
    expect(conflicts).toEqual([])

    stack.cache.writeItem({ collection, key: '1', item: { id: '1', title: 'Competing', body: 'New body' }, fieldTimestamps: { title: 20, body: 30 } })
    expect(query.data.value.title).toBe('Local')
    expect(conflicts).toEqual([expect.objectContaining({ field: 'title', localValue: 'Local', remoteValue: 'Competing' })])
  })

  it('clears causal metadata for one collection while preserving another collection', async () => {
    const stack = await createVueStack({ schema: [{ name: 'notes' }, { name: 'other' }], remote: false })
    for (const name of ['notes', 'other']) {
      const collection = stack.collection(name)
      stack.cache.writeItem({ collection, key: '1', item: { id: '1', title: name } })
      stack.cache.writeFieldTimestamps({ collectionName: name, key: '1', timestamps: { title: 100 } })
      stack.cache.deleteItem({ collection, key: 'deleted', deletedAt: 100 })
    }
    stack.cache.clearCollection({ collection: stack.collection('notes') })
    expect(stack.readMany('notes')).toEqual([])
    expect(stack.cache.readFieldTimestamps({ collectionName: 'notes', key: '1' })).toBeUndefined()
    expect(stack.cache.tombstones.get('notes', 'deleted')).toBeUndefined()
    expect(stack.read('other', '1')?.title).toBe('other')
    expect(stack.cache.readFieldTimestamps({ collectionName: 'other', key: '1' })).toEqual({ title: 100 })
    expect(stack.cache.tombstones.get('other', 'deleted')?.deletedAt).toBe(100)
    // Clearing causal history permits a subsequent older write in this collection.
    stack.cache.writeItem({ collection: stack.collection('notes'), key: 'deleted', item: { id: 'deleted', title: 'Restored' }, fieldTimestamps: { title: 50 } })
    expect(stack.read('notes', 'deleted')?.title).toBe('Restored')
  })

  it('supports public layer lookup and removes its visible effects with the handle', async () => {
    const stack = await createVueStack({ schema: [{ name: 'notes' }], remote: false })
    stack.store.notes.writeItem({ id: '1', title: 'Base' })
    expect(stack.cache.getLayer('edit')).toBeUndefined()
    stack.cache.addLayer({ id: 'edit', collectionName: 'notes', state: { 1: { title: 'Pending' } }, deletedItems: new Set() })
    const layer = stack.cache.getLayer('edit')!
    expect(layer.id).toBe('edit')
    expect(stack.read('notes', '1')?.title).toBe('Pending')
    stack.cache.removeLayer(layer.id)
    expect(stack.cache.getLayer('edit')).toBeUndefined()
    expect(stack.read('notes', '1')?.title).toBe('Base')
  })

  it('collects tombstones before a caller cutoff and permits reinsertion only for collected rows', async () => {
    const stack = await createVueStack({ schema: [{ name: 'notes' }], remote: false, tombstoneGc: false })
    const collection = stack.collection('notes')
    stack.cache.deleteItem({ collection, key: 'old', deletedAt: 10 })
    stack.cache.deleteItem({ collection, key: 'cutoff', deletedAt: 20 })
    expect(stack.cache.gcTombstones(20)).toEqual([{ collection: 'notes', key: 'old' }])
    expect(stack.cache.tombstones.get('notes', 'old')).toBeUndefined()
    expect(stack.cache.tombstones.get('notes', 'cutoff')?.deletedAt).toBe(20)
    for (const key of ['old', 'cutoff']) {
      stack.cache.writeItem({ collection, key, item: { id: key, title: 'Restored' }, fieldTimestamps: { title: 5 } })
    }
    expect(stack.readMany('notes')).toEqual([{ id: 'old', title: 'Restored' }])
    expect(stack.cache.gcTombstones(20)).toEqual([])
  })

  it('queues relation targets while validating public relation writes immediately', async () => {
    const stack = await createVueStack({
      schema: [
        { name: 'notes', relations: { owner: { to: { users: { on: { id: 'ownerId' } } } } } },
        { name: 'users' },
      ],
      remote: false,
    })
    const parentCollection = stack.collection('notes')
    const relation = parentCollection.relations.owner!
    stack.store.notes.writeItem({ id: '1', ownerId: 0 })
    stack.cache.pause()
    expect(() => stack.cache.writeItemForRelation({ parentCollection, relationKey: 'owner', relation, childItem: { name: 'Invalid' } }))
      .toThrow('Could not determine key for relation notes.owner')
    stack.cache.writeItemForRelation({ parentCollection, relationKey: 'owner', relation, childItem: { id: 0, name: 'Ada' } })
    expect(stack.read('users', 0)).toBeUndefined()
    stack.cache.resume()

    expect(stack.store.notes.peekFirst('1').owner.name).toBe('Ada')
    expect(stack.read('users', 0)).toMatchObject({ id: 0, name: 'Ada' })
    expect(stack.readMany('users')).toEqual([{ id: 0, name: 'Ada' }])
  })
})
