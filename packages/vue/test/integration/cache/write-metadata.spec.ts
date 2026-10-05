import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { blogSchema } from './extensionPoints'

/** Collects the metadata every interception hook call received, by operation. */
function observeMetadata(store: any) {
  const seen: Array<[string, string | number, unknown]> = []
  store.$hooks.hook('cacheBeforeWriteItem', (payload: any) => {
    seen.push(['write', payload.key, payload.metadata])
  })
  store.$hooks.hook('cacheBeforeDeleteItem', (payload: any) => {
    seen.push(['delete', payload.key, payload.metadata])
  })
  return seen
}

describe('write metadata: mutation options reach the cache hooks unchanged', () => {
  it('forwards metadata from create, update and delete', async () => {
    const stack = await createVueStack({ schema: blogSchema, data: { posts: [] } })
    const seen = observeMetadata(stack.store)
    const createMetadata = { version: 1 }

    await stack.store.posts.create({ id: 'p1', title: 'One' }, { metadata: createMetadata })
    await stack.store.posts.update({ id: 'p1', title: 'Two' }, { metadata: { version: 2 } })
    await stack.store.posts.delete('p1', { metadata: { version: 3 } })

    expect(seen).toEqual([
      ['write', 'p1', { version: 1 }],
      ['write', 'p1', { version: 2 }],
      ['delete', 'p1', { version: 3 }],
    ])
    expect(seen[0]![2]).toBe(createMetadata)
  })

  it('forwards metadata from createMany, updateMany and deleteMany through the per-item fallback', async () => {
    // An empty `*Many` answer is "not handled": core falls back to per-item hooks.
    const stack = await createVueStack({
      schema: blogSchema,
      data: { posts: [] },
      on: { createMany: () => [], updateMany: () => [] },
    })
    const seen = observeMetadata(stack.store)

    await stack.store.posts.createMany([{ id: 'p1' }, { id: 'p2' }], { metadata: { version: 1 } })
    await stack.store.posts.updateMany([{ id: 'p1', title: 'x' }], { metadata: { version: 2 } })
    await stack.store.posts.deleteMany(['p1', 'p2'], { metadata: { version: 3 } })

    expect(stack.remote.callCount('createItem', 'posts')).toBe(2)
    expect(stack.remote.callCount('updateItem', 'posts')).toBe(1)
    expect(seen).toEqual([
      ['write', 'p1', { version: 1 }],
      ['write', 'p2', { version: 1 }],
      ['write', 'p1', { version: 2 }],
      ['delete', 'p1', { version: 3 }],
      ['delete', 'p2', { version: 3 }],
    ])
  })

  it('forwards metadata from mutate, single and many', async () => {
    const stack = await createVueStack({ schema: blogSchema, data: { posts: [] } })
    const seen = observeMetadata(stack.store)

    await stack.store.posts.mutate(
      { mutation: 'create', item: { id: 'p1' }, metadata: { version: 1 } },
      ({ item }: any) => item,
    )
    await stack.store.posts.mutate(
      { mutation: 'update', items: [{ id: 'p1' }, { id: 'p2' }], metadata: { version: 2 } },
      ({ items }: any) => items,
    )

    expect(seen).toEqual([
      ['write', 'p1', { version: 1 }],
      ['write', 'p1', { version: 2 }],
      ['write', 'p2', { version: 2 }],
    ])
  })
})

describe('write metadata: unconsumed keys are reported in dev', () => {
  it('warns once per key that no handler consumed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const stack = await createVueStack({ schema: blogSchema, remote: false })
      const posts = stack.store.$collections.find((c: any) => c.name === 'posts')
      stack.store.$hooks.hook('cacheBeforeWriteItem', (payload: any) => {
        payload.consume('version')
        // Consumption is per write: p2 and p3 leave `source` unhandled.
        if (payload.key === 'p1') {
          payload.consume('source')
        }
      })

      for (const key of ['p1', 'p2', 'p3']) {
        stack.cache.writeItem({ collection: posts, key, item: { id: key }, metadata: { version: 1, source: 'ws' } })
      }

      const messages = warn.mock.calls.map(call => String(call[0]))
      expect(messages).toEqual([
        '[rstore] cache write metadata "source" for collection "posts" was not handled by any plugin',
      ])
    }
    finally {
      warn.mockRestore()
    }
  })

  it('warns for writes and deletes without any registered handler', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const stack = await createVueStack({ schema: blogSchema, remote: false })
      const posts = stack.store.$collections.find((c: any) => c.name === 'posts')

      stack.cache.writeItems({ collection: posts, items: [{ key: 'p1', value: { id: 'p1' }, metadata: { version: 1 } }] })
      stack.cache.deleteItem({ collection: posts, key: 'p1', metadata: { source: 'ws' } })

      expect(warn.mock.calls.map(call => String(call[0]))).toEqual([
        '[rstore] cache write metadata "version" for collection "posts" was not handled by any plugin',
        '[rstore] cache write metadata "source" for collection "posts" was not handled by any plugin',
      ])
    }
    finally {
      warn.mockRestore()
    }
  })
})
