import type { Collection, Plugin } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { createItem, createMany, deleteItem, deleteMany, findFirst, findMany, updateItem, updateMany } from '@rstore/core'
import { describe, expect, it } from 'vitest'

// `builtinCollectionHooksPlugin` is what makes `hooks: { fetchMany }` on a
// collection work — the shape ~40 existing tests use, none of which assert the
// plugin's own contract. What matters is that it wins over every `remote`
// plugin and that its `abort()` keeps the remote out of an operation the
// collection already handled: without it, a hook that resolves to nothing lets
// the backend answer (or, for the `*Many` hooks, lets rstore fall back to
// per-item calls) and the row is written twice.

/** Rows the fake backend starts with. */
const seedRows = [
  { id: '1', title: 'One' },
  { id: '2', title: 'Two' },
]

/**
 * Core store over one `todos` collection, a fake remote and the real cache.
 *
 * @param hooks Collection-level hooks under test.
 * @param extraPlugins Plugins registered after the fake remote.
 */
async function setup(hooks: Collection['hooks'], extraPlugins: Plugin[] = []) {
  const stack = await createCoreStack({
    schema: [{ name: 'todos', hooks }],
    plugins: extraPlugins,
    data: { todos: structuredClone(seedRows) },
    syncImmediately: false,
  })
  return { ...stack, collection: stack.store.$collections[0]! }
}

describe('hook dispatch', () => {
  it('calls `fetchFirst` with the key and the resolved find options', async () => {
    const seen: any[] = []
    const { store, collection } = await setup({
      fetchFirst: (options) => {
        seen.push(options)
        return { id: '9', title: 'From hook' }
      },
    })

    const { result } = await findFirst({ store, collection, findOptions: { key: '9', params: { deep: true } } })

    expect(result).toMatchObject({ id: '9', title: 'From hook' })
    // Find options reach the hook already resolved: a collection hook must see
    // the store's `findDefaults` the same way a plugin does.
    expect(seen[0]).toMatchObject({
      key: '9',
      params: { deep: true },
      fetchPolicy: expect.any(String),
      fetchOptions: { autoRefresh: 'manual' },
      resultMode: 'computed',
    })
  })

  it('calls `fetchMany` with the resolved find options', async () => {
    const seen: any[] = []
    const { store, collection } = await setup({
      fetchMany: (options) => {
        seen.push(options)
        return [{ id: '9', title: 'From hook' }]
      },
    })

    const { result } = await findMany({ store, collection, findOptions: { params: { page: 2 } } })

    expect(result.map((item: any) => item.id)).toEqual(['9'])
    expect(seen[0]).toMatchObject({ params: { page: 2 }, resultMode: 'computed' })
  })

  it('calls `create` with the item and `createMany` with the items', async () => {
    const seen: any[] = []
    const { store, collection } = await setup({
      create: ({ item }) => {
        seen.push(['create', item])
        return { ...item, id: 'c1' }
      },
      createMany: ({ items }) => {
        seen.push(['createMany', items])
        return items.map((item: any, index: number) => ({ ...item, id: `m${index}` }))
      },
    })

    const created = await createItem({ store, collection, item: { title: 'A' } as any })
    const createdMany = await createMany({ store, collection, items: [{ title: 'B' }, { title: 'C' }] as any })

    expect(created).toMatchObject({ id: 'c1', title: 'A' })
    expect(createdMany.map((item: any) => item.id)).toEqual(['m0', 'm1'])
    expect(seen).toEqual([
      ['create', { title: 'A' }],
      ['createMany', [{ title: 'B' }, { title: 'C' }]],
    ])
  })

  it('calls `update` with the key and the item', async () => {
    const seen: any[] = []
    const { store, collection } = await setup({
      update: ({ key, item }) => {
        seen.push([key, item])
        return { id: key, ...item }
      },
    })

    const updated = await updateItem({ store, collection, key: '1', item: { title: 'Renamed' } as any })

    expect(updated).toMatchObject({ id: '1', title: 'Renamed' })
    expect(seen).toEqual([['1', { title: 'Renamed' }]])
  })

  it('calls `updateMany` with the plain items promised by CollectionHooks', async () => {
    const seen: any[] = []
    const { store, collection } = await setup({
      updateMany: ({ items }) => {
        seen.push(items)
        return items
      },
    })

    await updateMany({ store, collection, items: [{ id: '1', title: 'A' }, { id: '2', title: 'B' }] as any })

    expect(seen[0]).toEqual([
      { id: '1', title: 'A' },
      { id: '2', title: 'B' },
    ])
  })

  it('calls `delete` with the key and `deleteMany` with the keys', async () => {
    const seen: any[] = []
    const { store, collection } = await setup({
      delete: ({ key }) => {
        seen.push(['delete', key])
      },
      deleteMany: ({ keys }) => {
        seen.push(['deleteMany', keys])
      },
    })

    await deleteItem({ store, collection, key: '1' })
    await deleteMany({ store, collection, keys: ['2', '3'] })

    expect(seen).toEqual([
      ['delete', '1'],
      ['deleteMany', ['2', '3']],
    ])
  })
})

describe('abort keeps the remote out', () => {
  it('does not let the remote answer a `fetchFirst` hook that found nothing', async () => {
    const { store, collection, remote } = await setup({ fetchFirst: () => null })

    const { result } = await findFirst({ store, collection, findOptions: { key: '1' } })

    expect(result).toBeNull()
    expect(remote.callCount('fetchFirst')).toBe(0)
  })

  it('does not let the remote answer a `fetchMany` hook that returned no rows', async () => {
    const { store, collection, remote } = await setup({ fetchMany: () => [] })

    const { result } = await findMany({ store, collection })

    expect(result).toEqual([])
    expect(remote.callCount('fetchMany')).toBe(0)
  })

  it('does not let the remote create the item a `create` hook did not return', async () => {
    const { store, collection, remote } = await setup({ create: () => undefined as any })

    await expect(createItem({ store, collection, item: { title: 'New' } as any }))
      .rejects
      .toThrow('Item creation failed: result is nullish')
    expect(remote.callCount('createItem')).toBe(0)
    expect(remote.rows('todos')).toHaveLength(2)
  })

  it('does not fall back to per-item creates when `createMany` returned no items', async () => {
    const { store, collection, remote } = await setup({ createMany: () => [] })

    const results = await createMany({ store, collection, items: [{ title: 'A' }, { title: 'B' }] as any })

    expect(results).toEqual([])
    expect(remote.callCount('createItem')).toBe(0)
    expect(remote.rows('todos')).toHaveLength(2)
  })

  it('does not let the remote update the item an `update` hook did not return', async () => {
    const { store, collection, remote } = await setup({ update: () => undefined as any })

    await expect(updateItem({ store, collection, key: '1', item: { title: 'Renamed' } as any }))
      .rejects
      .toThrow('Item update failed: result is nullish')
    expect(remote.callCount('updateItem')).toBe(0)
    expect(remote.rows('todos')).toMatchObject([{ id: '1', title: 'One' }, { id: '2' }])
  })

  it('does not fall back to per-item updates when `updateMany` returned no items', async () => {
    const { store, collection, remote } = await setup({ updateMany: () => [] })

    await updateMany({ store, collection, items: [{ id: '1', title: 'A' }] as any })

    expect(remote.callCount('updateItem')).toBe(0)
    expect(remote.rows('todos')).toMatchObject([{ id: '1', title: 'One' }, { id: '2' }])
  })

  it('does not let the remote delete an item a `delete` hook handled', async () => {
    const { store, collection, cache, remote } = await setup({ delete: () => {} })
    await findMany({ store, collection })

    await deleteItem({ store, collection, key: '1' })

    expect(remote.callCount('deleteItem')).toBe(0)
    expect(remote.rows('todos')).toHaveLength(2)
    // `deleteItem`/`deleteMany` abort without ever setting a result, so the
    // cache eviction is the only observable effect left.
    expect(cache.readItem({ collection, key: '1' })).toBeUndefined()
  })

  it('does not fall back to per-key deletes when `deleteMany` handled them', async () => {
    const { store, collection, cache, remote } = await setup({ deleteMany: () => {} })
    await findMany({ store, collection })

    await deleteMany({ store, collection, keys: ['1', '2'] })

    expect(remote.callCount('deleteMany')).toBe(0)
    expect(remote.callCount('deleteItem')).toBe(0)
    expect(remote.rows('todos')).toHaveLength(2)
    expect(cache.readItem({ collection, key: '1' })).toBeUndefined()
    expect(cache.readItem({ collection, key: '2' })).toBeUndefined()
  })
})

describe('plugin ordering', () => {
  it('wins over a `remote` plugin registered first', async () => {
    // `store.ts:43` unshifts the builtin and it declares
    // `before: { categories: ['remote'] }`, so it beats every `remote` plugin
    // however they were registered. Asserted through the dispatch, not through
    // the sorted array: whichever plugin runs first sets the result and
    // aborts, so the rows prove the effective order.
    const early: Plugin = {
      name: 'early-remote',
      category: 'remote',
      setup({ hook }: any) {
        hook('fetchMany', (payload: any) => {
          payload.setResult([{ id: 'r', title: 'From plugin' }])
        })
      },
    }
    const { store, collection } = await setup(
      { fetchMany: () => [{ id: 'h', title: 'From hook' }] },
      [early],
    )

    const { result } = await findMany({ store, collection })

    expect(result.map((item: any) => item.id)).toEqual(['h'])
  })

  it('leaves a collection without hooks to the remote plugin', async () => {
    const { store, collection, remote } = await setup(undefined)

    const { result } = await findMany({ store, collection })

    expect(result.map((item: any) => item.title)).toEqual(['One', 'Two'])
    expect(remote.callCount('fetchMany')).toBe(1)
  })
})
