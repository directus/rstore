import type { Collection } from '../../src'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'
import { addCollection, addCollections, removeCollection } from '../../src'

describe('bulk collection registration', () => {
  it.each([false, true])('resolves cached targets and relations within the batch (reverse order: %s)', async (reverse) => {
    const { store } = await createVueStack({
      remote: false,
      schema: [{ name: 'authors', getKey: item => item.uuid }],
    })
    store.authors.writeItem({ uuid: 'a1', slug: 'alice', name: 'Alice' })

    const collections: Collection[] = [
      {
        name: 'notes',
        relations: {
          author: { to: { authors: { on: { slug: 'authorSlug' } } } },
          tags: { many: true, to: { tags: { on: { noteId: 'id' } } } },
        },
      },
      {
        name: 'tags',
        relations: { note: { to: { notes: { on: { id: 'noteId' } } } } },
      },
    ]
    addCollections(store, reverse ? collections.toReversed() : collections)
    store.notes.writeItem({ id: 'n1', title: 'Note', authorSlug: 'alice' })
    store.tags.writeItem({ id: 't1', noteId: 'n1', label: 'urgent' })

    const note = store.notes.peekFirst('n1')
    expect(note.author?.name).toBe('Alice')
    expect(note.tags.map((tag: any) => tag.label)).toEqual(['urgent'])
    expect(store.tags.peekFirst('t1').note?.title).toBe('Note')

    store.authors.writeItem({ uuid: 'a1', slug: 'alice', name: 'Renamed' })
    expect(note.author?.name).toBe('Renamed')

    removeCollection(store, 'tags')
    addCollection(store, collections[1]!)
    expect(store.tags.peekMany()).toEqual([])
  })

  it('indexes visible optimistic rows and excludes deleted targets', async () => {
    const { store } = await createVueStack({ remote: false, schema: [{ name: 'authors' }] })
    store.authors.writeItem({ id: 'a1', slug: 'old', name: 'Removed' })
    store.$cache.addLayer({
      id: 'edit-authors',
      collectionName: 'authors',
      state: { a2: { id: 'a2', slug: 'new', name: 'Layered' } },
      deletedItems: new Set(['a1']),
    })

    addCollections(store, [
      { name: 'notes', relations: { author: { to: { authors: { on: { slug: 'authorSlug' } } } } } },
      { name: 'tags' },
    ])
    store.notes.writeItem({ id: 'n1', authorSlug: 'new' })
    store.notes.writeItem({ id: 'n2', authorSlug: 'old' })

    expect(store.notes.peekFirst('n1').author?.name).toBe('Layered')
    expect(store.notes.peekFirst('n2').author).toBeUndefined()
  })

  it.each([
    ['existing duplicates', 'authors', 'Collection authors already exists'],
    ['batch duplicates', 'notes', 'Collection notes already exists'],
    ['reserved names', '$invalid', 'Collection name "$invalid" cannot start with "$"'],
  ])('rejects %s before registering any collection', async (_, invalidName, message) => {
    const { store } = await createVueStack({ remote: false, schema: [{ name: 'authors' }] })
    store.authors.writeItem({ id: 'a1', name: 'Alice' })

    expect(() => addCollections(store, [{ name: 'notes' }, { name: invalidName! }]))
      .toThrow(message!)
    expect(store.$collections.map((collection: Collection) => collection.name)).toEqual(['authors'])
    expect(() => store.$collection('notes')).toThrow('Collection notes not found')
    expect(store.authors.peekFirst('a1').name).toBe('Alice')

    addCollection(store, { name: 'notes' })
    store.notes.writeItem({ id: 'n1', title: 'Retry' })
    expect(store.notes.peekFirst('n1').title).toBe('Retry')
  })

  it('preserves collection defaults when registering a batch', async () => {
    const { store } = await createVueStack({
      remote: false,
      schema: [],
      collectionDefaults: { getKey: item => item.uuid },
    })
    addCollections(store, [{ name: 'authors' }, { name: 'notes', getKey: item => item.slug }])
    store.authors.writeItem({ uuid: 'a1', name: 'Alice' })
    store.notes.writeItem({ slug: 'welcome', title: 'Note' })

    expect(store.authors.peekFirst('a1').name).toBe('Alice')
    expect(store.notes.peekFirst('welcome').title).toBe('Note')
  })

  it('visits cached rows at most once for a whole batch, and not for an empty batch', async () => {
    let keyReads = 0
    const { store } = await createVueStack({
      remote: false,
      schema: [{
        name: 'authors',
        getKey: (item) => {
          keyReads++
          return item.uuid
        },
      }],
    })
    for (let i = 0; i < 64; i++) {
      store.authors.writeItem({ uuid: `a${i}`, slug: `author-${i}`, name: `Author ${i}` })
    }
    keyReads = 0

    addCollections(store, [])
    expect(keyReads).toBe(0)

    addCollections(store, Array.from({ length: 32 }, (_, i) => ({
      name: `notes${i}`,
      relations: { author: { to: { authors: { on: { slug: 'authorSlug' } } } } },
    })))
    // Count observable getKey work instead of asserting a wall-clock threshold
    // or spying on a private rebuild helper. Relation reads prove indexing still happened.
    expect(keyReads).toBeLessThanOrEqual(64)
    for (const name of ['notes0', 'notes31']) {
      store.$collection(name).writeItem({ id: 'n1', authorSlug: 'author-63' })
      expect(store.$collection(name).peekFirst('n1').author?.name).toBe('Author 63')
    }
  })
})
