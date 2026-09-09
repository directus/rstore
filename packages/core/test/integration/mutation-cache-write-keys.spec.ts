import { createCoreStack } from '#test-utils/store/coreStack'
import { describe, expect, it } from 'vitest'

const setup = () => createCoreStack({ schema: [{ name: 'todos' }] })

describe('cache write key resolution', () => {
  // `packages/vue/src/cache/mutations.ts:113` resolves the key of every write
  // through a four-step fallback. The old suites asserted each step against a
  // copy of itself inside the mock cache; here each step is "the item is
  // readable under this key, and not under that one". The reads go through the
  // cache key rather than `$getKey()`, which answers from the item's own id.

  it('writes each item under its own key', async () => {
    const stack = await setup()

    stack.cache.applyMutation({
      collection: stack.collection('todos'),
      mutation: 'update',
      keys: ['a', 'b'],
      results: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] as any,
    })

    expect(stack.read('todos', 'a')).toMatchObject({ title: 'One' })
    expect(stack.read('todos', 'b')).toMatchObject({ title: 'Two' })
    expect(stack.read('todos', '1')).toBeUndefined()
    expect(stack.read('todos', '2')).toBeUndefined()
  })

  it('uses the single key for the first item only', async () => {
    const stack = await setup()

    stack.cache.applyMutation({
      collection: stack.collection('todos'),
      mutation: 'update',
      key: 'a',
      results: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] as any,
    })

    expect(stack.read('todos', 'a')).toMatchObject({ title: 'One' })
    expect(stack.read('todos', '2')).toMatchObject({ title: 'Two' })
    expect(stack.read('todos', '1')).toBeUndefined()
  })

  it('uses the key carried by a mutation item entry', async () => {
    const stack = await setup()

    stack.cache.applyMutation({
      collection: stack.collection('todos'),
      mutation: 'update',
      items: [{ key: 'a', item: { id: '1', title: 'One' } }] as any,
    })

    expect(stack.read('todos', 'a')).toMatchObject({ title: 'One' })
    expect(stack.read('todos', '1')).toBeUndefined()
  })

  it('falls back to the collection key of the written item', async () => {
    const stack = await setup()

    stack.cache.applyMutation({
      collection: stack.collection('todos'),
      mutation: 'update',
      results: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] as any,
    })

    expect(stack.read('todos', '1')).toMatchObject({ title: 'One' })
    expect(stack.read('todos', '2')).toMatchObject({ title: 'Two' })
  })
})
