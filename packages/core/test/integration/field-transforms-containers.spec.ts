import { createDeferred } from '#test-utils/deferred'
import { createCoreStack } from '#test-utils/store/coreStack'
import { createItem, createMany } from '@rstore/core'
import { describe, expect, it } from 'vitest'

describe('field transforms in containers', () => {
  it('preserves copied containers while a hook changes another field', async () => {
    const at = new Date('2023-01-01T00:00:00.000Z')
    const stack = await createCoreStack({
      schema: [{ name: 'events', fields: {
        dates: {
          serialize: (dates: Date[]) => dates.map(date => date.toISOString()),
          parse: (dates: string[]) => dates.map(date => new Date(date)),
        },
      } }],
      plugins: [{
        name: 'copy-containers',
        setup({ hook }) {
          hook('beforeMutation', ({ item, setItem }: any) => {
            setItem({ ...item, title: 'Changed' })
          })
        },
      }],
    })
    const item = { id: '1', title: 'Original', dates: [at], labels: new Map([['note', null]]), rawDate: at, tags: new Set(['tag']) }

    const result = await createItem({ store: stack.store, collection: stack.collection('events'), item: item as any })

    expect(result).toMatchObject({ ...item, title: 'Changed' })
    expect(stack.read('events', '1')).toMatchObject({ ...item, title: 'Changed' })
    expect(stack.remote.rows('events')).toEqual([{ ...item, title: 'Changed', dates: [at.toISOString()] }])
    expect(item.title).toBe('Original')
    expect(item.dates).toEqual([at])
  })

  it.each(['createItem', 'createMany'] as const)('keeps explicit nullish %s replacements inside Map values', async (method) => {
    const entered = createDeferred<void>()
    const release = createDeferred<void>()
    const at = new Date('2023-01-01T00:00:00.000Z')
    const stack = await createCoreStack({
      schema: [{ name: 'events', fields: { at: { parse: (value: string) => new Date(value), serialize: (value: Date) => value.toISOString() } } }],
      on: { [method]: async (ctx: any) => {
        entered.resolve()
        await release.promise
        return ctx.next()
      } },
      plugins: [{
        name: 'flip-nullish-map-values',
        setup({ hook }) {
          /** Swap the two nullish Map values, carrying the hook's serialized date forward. */
          function flip(item: any) {
            return { ...item, labels: new Map([['note', undefined], ['tag', null]]) }
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
    const item = { id: '1', at, labels: new Map<string, unknown>([['note', null], ['tag', undefined]]) }
    const options = { store: stack.store, collection: stack.collection('events') }
    const pending = method === 'createMany'
      ? createMany({ ...options, items: [item] as any })
      : createItem({ ...options, item: item as any })
    try {
      // Fail immediately on preparation errors; otherwise inspect the held mutation.
      await Promise.race([entered.promise, pending])
      const labels = stack.read('events', '1')?.labels
      expect(labels.get('note')).toBeUndefined()
      expect(labels.get('tag')).toBeNull()
      // The Map replacement does not stop the serialized date from being restored.
      expect(stack.read('events', '1')?.at).toEqual(at)
    }
    finally {
      release.resolve()
    }
    await pending
    const [row] = stack.remote.rows('events')
    expect(row!.at).toBe(at.toISOString())
    // An explicitly cleared entry still reaches the backend as a sent entry.
    expect(row!.labels.has('note')).toBe(true)
    expect(row!.labels.get('note')).toBeUndefined()
    expect(row!.labels.get('tag')).toBeNull()
    expect(stack.read('events', '1')?.labels.get('note')).toBeUndefined()
    expect(stack.read('events', '1')?.labels.get('tag')).toBeNull()
    expect(item.labels.get('note')).toBeNull()
    expect(item.labels.get('tag')).toBeUndefined()
  })

  it('keeps an array hole a hook opens over a previous value', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'events' }],
      plugins: [{
        name: 'drop-first-tag',
        setup({ hook }) {
          hook('beforeMutation', ({ item, setItem }: any) => {
            // A hole reads like `undefined`, so only own-property presence tells
            // this replacement apart from the `null` the previous item holds.
            const tags: unknown[] = []
            tags[1] = item.tags[1]
            setItem({ ...item, tags })
          })
        },
      }],
    })
    const result = await createItem({
      store: stack.store,
      collection: stack.collection('events'),
      item: { id: '1', tags: [null, 'second'] } as any,
    })
    expect((result as any).tags).toEqual([undefined, 'second'])
    expect(stack.remote.rows('events')).toEqual([{ id: '1', tags: [undefined, 'second'] }])
    expect(stack.read('events', '1')?.tags).toEqual([undefined, 'second'])
  })
})
