import { createCoreStack } from '#test-utils/store/coreStack'
import { createMany } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'
import { cachedTitles } from './utils/manyMutation'

describe('createMany hook substitutions', () => {
  it('layers the substituted items, pairing each key with its own body', async () => {
    // `createMany` built its optimistic layer by reading the key from the
    // current `items` and the body from `originalItems[i]`, so a `setItems`
    // that changed the array paired a new key with an old body — or read past
    // the end of the original array when the substitution was longer.
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      plugins: [{
        name: 'substitute-items',
        setup({ hook }: any) {
          hook('beforeManyMutation', ({ setItems }: any) => setItems([
            { id: 'sub-a', title: 'Substituted A' },
            { id: 'sub-b', title: 'Substituted B' },
          ]))
        },
      }],
    })
    const release = stack.remote.holdNext('createMany')

    const pending = createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: 'orig', title: 'Original' }] as any,
    })
    await vi.waitFor(() => expect(stack.remote.callCount('createMany')).toBe(1))

    // Read through the layer while the create is still in flight.
    expect(cachedTitles(stack)).toEqual({ 'sub-a': 'Substituted A', 'sub-b': 'Substituted B' })

    release()
    await pending
  })

  it('creates the items a beforeManyMutation hook substituted, not the originals', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      plugins: [{
        name: 'substitute-items',
        setup({ hook }: any) {
          hook('beforeManyMutation', ({ setItems }: any) => setItems([{ id: '3', title: 'Three' }]))
        },
      }],
    })

    await createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'One' }] as any,
    })

    expect(stack.remote.rows('todos')).toEqual([{ id: '3', title: 'Three' }])
    expect(cachedTitles(stack)).toEqual({ 3: 'Three' })
  })

  it('caches what an afterManyMutation hook set, not what the remote answered', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'todos' }],
      plugins: [{
        name: 'rewrite-results',
        setup({ hook }: any) {
          hook('afterManyMutation', ({ setResult }: any) => setResult([{ id: '1', title: 'Rewritten' }]))
        },
      }],
    })

    const result = await createMany({
      store: stack.store,
      collection: stack.collection('todos'),
      items: [{ id: '1', title: 'One' }] as any,
    })

    expect(result.map((item: any) => item.title)).toEqual(['Rewritten'])
    expect(cachedTitles(stack)).toEqual({ 1: 'Rewritten' })
    // The backend still holds what it was actually sent.
    expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'One' }])
  })
})
