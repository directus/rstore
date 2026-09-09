import { createCoreStack } from '#test-utils/store/coreStack'
import { findMany, updateMany } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'
import { cachedTitles, loadManyMutationRows } from './utils/manyMutation'

describe('updateMany hook substitutions', () => {
  const load = loadManyMutationRows
  it('passes plain items to each callback after a preceding replacement', async () => {
    const seen: any[] = []
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }] },
      plugins: [{
        name: 'compose-update-items',
        setup({ hook }) {
          hook('beforeManyMutation', ({ items, setItems }: any) => {
            seen.push(items.map((item: any) => ({ ...item })))
            setItems(items.map((item: any) => ({ ...item, title: 'First' })))
          })
          hook('beforeManyMutation', ({ items, setItems }: any) => {
            seen.push(items.map((item: any) => ({ ...item })))
            setItems(items.map((item: any) => ({ ...item, title: `${item.title} then second` })))
          })
        },
      }],
    })
    const result = await updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'Edited' }] as any,
    })
    expect(seen).toEqual([[{ id: '1', title: 'Edited' }], [{ id: '1', title: 'First' }]])
    expect(result).toEqual([{ id: '1', title: 'First then second' }])
    expect(stack.remote.rows('todos')).toEqual(result)
    expect(stack.read('todos', '1')?.title).toBe('First then second')
  })

  it('layers the substituted items, pairing each key with its own body', async () => {
    // `updateMany` read the layer key from `itemsWithKey` but the body from
    // `originalItems[i]`. Once `setItems` replaced the array the two were no
    // longer index-aligned, so the layer showed key '2' carrying item '1's body.
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] },
      plugins: [{
        name: 'substitute-items',
        setup({ hook }: any) {
          hook('beforeManyMutation', ({ setItems }: any) => setItems([{ id: '2', title: 'Substituted' }]))
        },
      }],
    })
    await load(stack)
    const release = stack.remote.holdNext('updateMany')

    const pending = updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'First' }] as any,
    })
    await vi.waitFor(() => expect(stack.remote.callCount('updateMany')).toBe(1))

    // Read through the layer while the update is still in flight: key '2' must
    // carry the substituted title, and '1' must be untouched.
    expect(cachedTitles(stack)).toEqual({ 1: 'One', 2: 'Substituted' })

    release()
    await pending
  })

  it('updates the items a beforeManyMutation hook substituted, not the originals', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      data: { todos: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] },
      plugins: [{
        name: 'substitute-items',
        setup({ hook }: any) {
          hook('beforeManyMutation', ({ setItems }: any) => setItems([{ id: '2', title: 'Substituted' }]))
        },
      }],
    })

    await updateMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'First' }] as any,
    })

    expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'One' }, { id: '2', title: 'Substituted' }])
    expect(stack.read('todos', '2')).toMatchObject({ title: 'Substituted' })
    expect(stack.read('todos', '1')).toBeUndefined()
  })

  it('drops replaced keys from cached fallback results', async () => {
    const resultsSeenByAfterMany: string[][] = []
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      remote: false,
      plugins: [{
        name: 'substitute-and-answer-items',
        setup({ hook }: any) {
          hook('beforeManyMutation', ({ setItems }: any) => setItems([{ id: '2', title: 'Substituted' }]))
          hook('updateItem', ({ key, item, setResult }: any) => setResult({ id: key, ...item }))
          hook('afterManyMutation', ({ getResult }: any) => {
            resultsSeenByAfterMany.push(getResult().map((item: any) => item.id))
          })
        },
      }],
    })
    const collection = stack.collection('todos')
    stack.cache.writeItem({ collection, key: '1', item: { id: '1', title: 'One' } })
    stack.cache.writeItem({ collection, key: '2', item: { id: '2', title: 'Two' } })

    await updateMany({
      store: stack.store,
      collection,
      items: [{ id: '1', title: 'Original' }] as any,
    })

    // `setItems` replaces the whole target set. The old key must not remain
    // in `peekMany`'s fallback result and produce a phantom after hook entry.
    expect(resultsSeenByAfterMany).toEqual([['2']])
  })

  it('uses cached fallback data for key 0', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      remote: false,
      plugins: [{
        name: 'single-zero-update',
        setup({ hook }: any) {
          hook('fetchMany', ({ setResult }: any) => setResult([{ id: 0, title: 'Zero', note: 'keep me' }]))
          hook('updateItem', ({ key, setResult }: any) => setResult({ id: key, title: 'Renamed' }))
        },
      }],
    })
    const collection = stack.collection('todos')
    await findMany({ store: stack.store, collection })

    const result = await updateMany({
      store: stack.store,
      collection,
      items: [{ id: 0, title: 'Renamed' }] as any,
    })

    // The per-item hook does not return `note`; its presence proves the
    // fallback filter accepted key 0 and merged the cached result.
    expect(result[0]).toMatchObject({ id: 0, title: 'Renamed', note: 'keep me' })
  })
})
