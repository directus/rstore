import { createDeferred } from '#test-utils/deferred'
import { createCoreStack } from '#test-utils/store/coreStack'
import { createItem, createMany, findMany, updateItem, updateMany } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'

describe('field transforms', () => {
  it.each((['createItem', 'updateItem', 'createMany', 'updateMany'] as const).flatMap(method => ['copy', 'in-place'].map(mode => ({ method, mode }))))('preserves transport fields across $method $mode hook replacements', async ({ method, mode }) => {
    const entered = createDeferred<void>()
    const release = createDeferred<void>()
    const parse = vi.fn((value: string) => new Date(value))
    const at = new Date('2023-01-01T00:00:00.000Z')
    const stack = await createCoreStack({
      schema: [{ name: 'events', fields: { 'metadata.at': { parse, serialize: (value: Date) => value.toISOString() } } }],
      data: { events: [{ id: '1', metadata: { at: at.toISOString() } }] },
      on: { [method]: async (ctx: any) => {
        entered.resolve()
        await release.promise
        return ctx.next()
      } },
      plugins: [{
        name: 'replace-copied-payload',
        setup({ hook }) {
          /** Edit one field while carrying the hook's serialized date forward. */
          function edit(item: any) {
            if (mode === 'in-place') {
              item.metadata.label = 'Edited'
              return item
            }
            return { ...item, metadata: { ...item.metadata, label: 'Edited' } }
          }
          hook('beforeMutation', ({ item, setItem }: any) => {
            setItem(edit(item))
          })
          hook('beforeManyMutation', ({ items, setItems }: any) => {
            setItems(items.map(edit))
          })
        },
      }],
    })
    const item = { id: '1', metadata: { at } }
    const options = { store: stack.store, collection: stack.collection('events') }
    const pending = method === 'createMany' || method === 'updateMany'
      ? (method === 'createMany' ? createMany : updateMany)({ ...options, items: [item] })
      : (method === 'createItem' ? createItem : updateItem)({ ...options, item })
    try {
      // Fail immediately on preparation errors; otherwise inspect the held mutation.
      await Promise.race([entered.promise, pending])
      expect(stack.read('events', '1')?.metadata).toEqual({ at, label: 'Edited' })
      expect(parse).not.toHaveBeenCalled()
    }
    finally {
      release.resolve()
    }
    const result = await pending
    expect(Array.isArray(result) ? result[0] : result).toMatchObject({ metadata: { at, label: 'Edited' } })
    expect(stack.remote.rows('events')).toEqual([{ id: '1', metadata: { at: at.toISOString(), label: 'Edited' } }])
    expect(stack.read('events', '1')?.metadata).toEqual({ at, label: 'Edited' })
    expect(parse).toHaveBeenCalledTimes(1)
    expect(item).toEqual({ id: '1', metadata: { at } })
  })

  it.each(['createItem', 'updateItem', 'createMany', 'updateMany'] as const)('keeps explicit nullish %s replacements apart from their previous values', async (method) => {
    const entered = createDeferred<void>()
    const release = createDeferred<void>()
    const at = new Date('2023-01-01T00:00:00.000Z')
    const stack = await createCoreStack({
      schema: [{ name: 'events', fields: { at: { parse: (value: string) => new Date(value), serialize: (value: Date) => value.toISOString() } } }],
      data: { events: [{ id: '1', at: at.toISOString() }] },
      on: { [method]: async (ctx: any) => {
        entered.resolve()
        await release.promise
        return ctx.next()
      } },
      plugins: [{
        name: 'flip-nullish-fields',
        setup({ hook }) {
          /** Clear one field and fill another, carrying the hook's serialized date forward. */
          function flip(item: any) {
            return { ...item, note: undefined, tag: null }
          }
          hook('beforeMutation', ({ item, setItem }: any) => {
            setItem(flip(item))
          })
          hook('beforeManyMutation', ({ items, setItems }: any) => {
            setItems(items.map(flip))
          })
        },
      }],
    })
    const item = { id: '1', at, note: null, tag: undefined }
    const options = { store: stack.store, collection: stack.collection('events') }
    const pending = method === 'createMany' || method === 'updateMany'
      ? (method === 'createMany' ? createMany : updateMany)({ ...options, items: [item] })
      : (method === 'createItem' ? createItem : updateItem)({ ...options, item })
    try {
      // Fail immediately on preparation errors; otherwise inspect the held mutation.
      await Promise.race([entered.promise, pending])
      const pendingItem = stack.read('events', '1')
      expect(pendingItem?.note).toBeUndefined()
      expect(pendingItem?.tag).toBeNull()
      expect(pendingItem?.at).toEqual(at)
    }
    finally {
      release.resolve()
    }
    await pending
    const [row] = stack.remote.rows('events')
    expect(row).toMatchObject({ id: '1', at: at.toISOString(), tag: null })
    // An explicitly cleared field still reaches the backend as a sent field.
    expect(Object.hasOwn(row!, 'note')).toBe(true)
    expect(row!.note).toBeUndefined()
    expect(stack.read('events', '1')?.note).toBeUndefined()
    expect(stack.read('events', '1')?.tag).toBeNull()
    expect(item).toStrictEqual({ id: '1', at, note: null, tag: undefined })
  })

  it('preserves nested nullish replacements while a many hook reorders, rekeys and drops a field', async () => {
    const first = new Date('2023-01-01T00:00:00.000Z')
    const second = new Date('2024-01-01T00:00:00.000Z')
    const stack = await createCoreStack({
      schema: [{ name: 'events', fields: { 'meta.at': { parse: (value: string) => new Date(value), serialize: (value: Date) => value.toISOString() } } }],
      plugins: [{
        name: 'reverse-and-clear',
        setup({ hook }) {
          hook('beforeManyMutation', ({ items, setItems }: any) => {
            setItems([...items].reverse().map(({ draft: _draft, ...item }: any) => ({
              ...item,
              id: `new-${item.id}`,
              meta: { ...item.meta, note: undefined },
            })))
          })
        },
      }],
    })
    const result = await createMany({
      store: stack.store,
      collection: stack.collection('events'),
      items: [first, second].map((at, index) => ({ id: String(index), draft: true, meta: { at, note: null } })),
    })
    expect(result.map(item => [item.id, item.meta.at, item.meta.note])).toEqual([
      ['new-1', second, undefined],
      ['new-0', first, undefined],
    ])
    const rows = stack.remote.rows('events')
    expect(rows.map(row => [row.id, row.meta.at, row.meta.note])).toEqual([
      ['new-1', second.toISOString(), undefined],
      ['new-0', first.toISOString(), undefined],
    ])
    expect(rows.map(row => [Object.hasOwn(row, 'draft'), Object.hasOwn(row.meta, 'note')])).toEqual([[false, true], [false, true]])
    expect(stack.read('events', 'new-0')?.meta).toEqual({ at: first, note: undefined })
  })

  it.each([false, true])('composes reordered createMany replacements (new keys: %s)', async (rekey) => {
    const dates = [new Date('2023-01-01T00:00:00.000Z'), new Date('2024-01-01T00:00:00.000Z')]
    const stack = await createCoreStack({
      schema: [{ name: 'events', fields: { at: { parse: (value: string) => new Date(value), serialize: (value: Date) => value.toISOString() } } }],
      plugins: [{
        name: 'compose-replacements',
        setup({ hook }) {
          hook('beforeManyMutation', ({ items, setItems }: any) => {
            setItems([...items].reverse().map((item: any) => ({ ...item, id: rekey ? `new-${item.id}` : item.id, title: 'First' })))
          })
          hook('beforeManyMutation', ({ items, setItems }: any) => {
            setItems(items.map((item: any) => ({ ...item, title: `${item.title} then second` })))
          })
        },
      }],
    })
    const result = await createMany({
      store: stack.store,
      collection: stack.collection('events'),
      items: dates.map((at, index) => ({ id: String(index), at })),
    })
    expect(result.map(item => [item.id, item.at, item.title])).toEqual([
      [rekey ? 'new-1' : '1', dates[1], 'First then second'],
      [rekey ? 'new-0' : '0', dates[0], 'First then second'],
    ])
    expect(stack.read('events', rekey ? 'new-0' : '0')?.at).toEqual(dates[0])
    expect(stack.read('events', rekey ? 'new-1' : '1')?.at).toEqual(dates[1])
  })

  it('preserves nested array dates when a many hook changes the key and clears another field', async () => {
    const at = new Date('2023-01-01T00:00:00.000Z')
    const stack = await createCoreStack({
      schema: [{ name: 'events', fields: { 'entries.0.at': { parse: (value: string) => new Date(value), serialize: (value: Date) => value.toISOString() } } }],
      plugins: [{
        name: 'replace-key',
        setup({ hook }) {
          hook('beforeManyMutation', ({ items, setItems }: any) => {
            setItems(items.map((item: any) => ({
              ...item,
              id: 'replacement',
              optional: undefined,
              entries: item.entries.map((entry: any) => ({ ...entry, label: 'Edited' })),
            })))
          })
        },
      }],
    })
    const result = await createMany({
      store: stack.store,
      collection: stack.collection('events'),
      items: [{ id: 'original', optional: 'clear me', entries: [{ at }] }],
    })
    expect(result).toEqual([{ id: 'replacement', optional: undefined, entries: [{ at, label: 'Edited' }] }])
    expect(stack.read('events', 'original')).toBeUndefined()
    expect(stack.read('events', 'replacement')?.entries).toEqual([{ at, label: 'Edited' }])
  })

  it('parses nested relation fields returned by a query', async () => {
    const stack = await createCoreStack({
      schema: [
        {
          name: 'messages',
          relations: { author: { to: { users: { on: { id: 'authorId' } } } } },
        },
        {
          name: 'users',
          fields: { createdAt: { parse: (value: string) => new Date(value) } },
        },
      ],
      data: {
        messages: [{
          id: 'm1',
          authorId: 'u1',
          author: { id: 'u1', createdAt: '2023-01-01T00:00:00Z' },
        }],
      },
    })

    const { result } = await findMany({
      store: stack.store,
      collection: stack.collection('messages'),
      findOptions: { include: { author: true }, fetchPolicy: 'fetch-only' },
    })

    expect(result[0]?.author.createdAt).toBeInstanceOf(Date)
    expect(result[0]?.author.createdAt.toISOString()).toBe('2023-01-01T00:00:00.000Z')
  })

  it('serializes nested paths before remote dispatch and caches parsed values', async () => {
    let wireValue: unknown
    const stack = await createCoreStack({
      schema: [{
        name: 'events',
        fields: {
          'metadata.createdAt': {
            parse: (value: string) => new Date(value),
            serialize: (value: Date) => value.toISOString(),
          },
        },
      }],
      plugins: [{
        name: 'wire-observer',
        before: { plugins: ['fake-remote'] },
        setup({ hook }: any) {
          hook('createItem', ({ item }: any) => {
            wireValue = item.metadata.createdAt
          })
        },
      }],
    })
    const createdAt = new Date('2023-01-01T00:00:00Z')

    await createItem({
      store: stack.store,
      collection: stack.collection('events'),
      item: { id: 'e1', metadata: { createdAt } } as any,
    })

    expect(wireValue).toBe('2023-01-01T00:00:00.000Z')
    expect(stack.read('events', 'e1')?.metadata.createdAt).toBeInstanceOf(Date)
    expect(createdAt).toEqual(new Date('2023-01-01T00:00:00Z'))
  })

  it('does not call field serializers for null values', async () => {
    const serialize = vi.fn((value: unknown) => String(value))
    const stack = await createCoreStack({
      schema: [{ name: 'events', fields: { optional: { serialize } } }],
    })

    await createItem({
      store: stack.store,
      collection: stack.collection('events'),
      item: { id: 'e1', optional: null } as any,
    })

    expect(serialize).not.toHaveBeenCalled()
    expect(stack.remote.lastRequest('createItem')?.item?.optional).toBeNull()
  })
})
