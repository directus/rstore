import type { MultiplayerPluginOptions } from '@rstore/multiplayer'
import { createTestStore } from '#test-utils/store/integrationStore'
import { createMultiplayerPlugin, getFieldTimestamps, getTombstone } from '@rstore/multiplayer'
import { describe, expect, it, vi } from 'vitest'

/** Real store with the multiplayer plugin and two collections. */
async function setup(lww: MultiplayerPluginOptions['lww'] = true) {
  const store = await createTestStore({
    schema: [{ name: 'todos' }, { name: 'notes' }],
    plugins: [createMultiplayerPlugin({ lww, tombstoneGc: false })],
  }) as any
  const todos = store.$collections.find((c: any) => c.name === 'todos')
  const notes = store.$collections.find((c: any) => c.name === 'notes')
  const conflicts: any[] = []
  store.$hooks.hook('cacheConflict', (payload: any) => {
    conflicts.push({ collection: payload.collection.name, key: payload.key, conflicts: payload.conflicts })
  })
  /** Write a stamped row. */
  function write(collection: any, item: Record<string, any>, fieldTimestamps?: Record<string, number>) {
    store.$cache.writeItem({ collection, key: item.id, item, metadata: fieldTimestamps && { fieldTimestamps } })
  }
  /** Committed data of a cached row, through the public state snapshot. */
  function read(collection: any, key: string): Record<string, any> | undefined {
    return store.$cache.getState().collections[collection.name]?.[key]
  }
  return { store, todos, notes, conflicts, write, read }
}

describe('createMultiplayerPlugin: field LWW', () => {
  it('merges a stamped write field by field and stores the merged stamps', async () => {
    const { store, todos, write, read } = await setup()
    write(todos, { id: '1', title: 'A', done: false }, { title: 10, done: 10 })
    write(todos, { id: '1', title: 'B' }, { title: 20 })

    expect(read(todos, '1')).toMatchObject({ id: '1', title: 'B', done: false })
    expect(getFieldTimestamps(store, 'todos', '1')).toMatchObject({ title: 20, done: 10 })
  })

  it('keeps the stored value when the incoming stamp is older', async () => {
    const { store, todos, write, read } = await setup()
    write(todos, { id: '1', title: 'New' }, { title: 20 })
    write(todos, { id: '1', title: 'Stale' }, { title: 10 })

    expect(read(todos, '1')?.title).toBe('New')
    expect(getFieldTimestamps(store, 'todos', '1')).toMatchObject({ title: 20 })
  })

  it('emits cacheConflict once for an equal stamp with a different value, keeping the local value', async () => {
    const { todos, write, read, conflicts } = await setup()
    write(todos, { id: '1', title: 'Local' }, { title: 10 })
    write(todos, { id: '1', title: 'Remote' }, { title: 10 })
    // Same value at the same stamp is not a conflict.
    write(todos, { id: '1', title: 'Local' }, { title: 10 })

    expect(read(todos, '1')?.title).toBe('Local')
    expect(conflicts).toEqual([{
      collection: 'todos',
      key: '1',
      conflicts: [{ field: 'title', localValue: 'Local', remoteValue: 'Remote', localTimestamp: 10, remoteTimestamp: 10 }],
    }])
  })

  it.each([
    ['local-wins', 'Local'],
    ['remote-wins', 'Remote'],
  ] as const)('resolves an equal-stamp conflict with the %s policy without emitting', async (conflictPolicy, expected) => {
    const { todos, write, read, conflicts } = await setup({ conflictPolicy })
    write(todos, { id: '1', title: 'Local', done: false }, { title: 10, done: 10 })
    write(todos, { id: '1', title: 'Remote', done: true }, { title: 10, done: 20 })

    expect(read(todos, '1')).toMatchObject({ title: expected, done: true })
    expect(conflicts).toEqual([])
  })

  it('resolves equal-stamp conflicts with a policy function, falling back to cacheConflict when it returns nothing', async () => {
    const policy = vi.fn((context: any) => context.conflict.field === 'title'
      ? { value: `${context.conflict.localValue}+${context.conflict.remoteValue}` }
      : undefined)
    const { todos, write, read, conflicts } = await setup({ conflictPolicy: policy })
    write(todos, { id: '1', title: 'L', body: 'l' }, { title: 10, body: 10 })
    write(todos, { id: '1', title: 'R', body: 'r' }, { title: 10, body: 10 })

    expect(read(todos, '1')).toMatchObject({ title: 'L+R', body: 'l' })
    expect(policy).toHaveBeenCalledWith(expect.objectContaining({ collection: 'todos', key: '1' }))
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].conflicts.map((c: any) => c.field)).toEqual(['body'])
  })

  it.each([
    ['a name list', ['todos']],
    ['a predicate', (collection: any) => collection.name === 'todos'],
  ] as const)('applies only to the collections selected by %s', async (_, collections) => {
    const { store, todos, notes, write, read } = await setup({ collections: collections as any })
    write(todos, { id: '1', title: 'New' }, { title: 20 })
    write(todos, { id: '1', title: 'Stale' }, { title: 10 })
    write(notes, { id: '1', title: 'New' }, { title: 20 })
    write(notes, { id: '1', title: 'Stale' }, { title: 10 })

    expect(read(todos, '1')?.title).toBe('New')
    // Not selected: a plain overwrite, and no stamps are recorded.
    expect(read(notes, '1')?.title).toBe('Stale')
    expect(getFieldTimestamps(store, 'notes', '1')).toBeUndefined()
  })

  it('keeps the stored stamps when an unstamped write changes a stamped item', async () => {
    // Documents current behaviour (inventory gap 1): local commits are not stamped,
    // so the stored stamps go stale instead of being touched or dropped.
    const { store, todos, write, read } = await setup()
    write(todos, { id: '1', title: 'Stamped' }, { title: 20 })
    write(todos, { id: '1', title: 'Local commit' })

    expect(read(todos, '1')?.title).toBe('Local commit')
    expect(getFieldTimestamps(store, 'todos', '1')).toEqual({ title: 20 })
    write(todos, { id: '1', title: 'Older frame' }, { title: 10 })
    expect(read(todos, '1')?.title).toBe('Local commit')
  })

  it('keeps the later tombstone when deletes arrive out of order', async () => {
    const { store, todos, write, read } = await setup()
    store.$cache.deleteItem({ collection: todos, key: '1', metadata: { deletedAt: 30 } })
    store.$cache.deleteItem({ collection: todos, key: '1', metadata: { deletedAt: 10 } })
    write(todos, { id: '1', title: 'Between both deletes' }, { title: 20 })

    expect(read(todos, '1')).toBeUndefined()
    expect(getTombstone(store, 'todos', '1')?.deletedAt).toBe(30)
  })

  it('consumes the stamps it handles, so no unconsumed-metadata warning is reported', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { store, todos, write } = await setup()
    write(todos, { id: '1', title: 'A' }, { title: 10 })
    store.$cache.deleteItem({ collection: todos, key: '1', metadata: { deletedAt: 20 } })

    expect(warn).not.toHaveBeenCalled()
  })
})
