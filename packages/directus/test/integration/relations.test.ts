import type { StoreSchema } from '@rstore/shared'
import { describe, expect, it, vi } from 'vitest'
import { createDeferred } from '../../../../test/utils/deferred'
import { createProfilesCollection, createTodosCollection } from '../utils/plugin'
import { createDirectusStack } from '../utils/store'

vi.mock('@directus/sdk', async () => (await import('../utils/sdk-mocks')).directusSdkMocks())

/** Consumer schema with both author directions and a second include level. */
const schema: StoreSchema = [
  {
    ...createProfilesCollection(),
    relations: { todos: { many: true, to: { Todos: { on: { author_id: 'id' } } } } },
  },
  {
    ...createTodosCollection(),
    relations: {
      author: { to: { Profiles: { on: { id: 'author_id' } } } },
      comments: { many: true, to: { Comments: { on: { todo_id: 'id' } } } },
    },
  },
  { name: 'Comments' },
]

describe('directus relation consumers', () => {
  it('resolves nested author todos for a single keyed result and caches both nested records', async () => {
    const { store, client } = await createDirectusStack(schema)
    client.request.mockResolvedValueOnce({ id: 1, title: 'First', author_id: 'p1' })
      .mockResolvedValueOnce([{ id: 'p1', name: 'Ada' }])
      .mockResolvedValueOnce([
        { id: 1, title: 'First', author_id: 'p1' },
        { id: 2, title: 'Second', author_id: 'p1' },
      ])

    const todo = await store.Todos.findFirst({
      key: 1,
      include: { author: { include: { todos: true } } },
    })

    expect.soft(client.request.mock.calls).toEqual([
      [{ op: 'readItem', args: ['Todos', 1, {}] }],
      [{ op: 'readItems', args: ['Profiles', { filter: { id: { _in: ['p1'] } } }] }],
      [{ op: 'readItems', args: ['Todos', { filter: { author_id: { _in: ['p1'] } } }] }],
    ])
    expect({
      id: todo.id,
      title: todo.title,
      author_id: todo.author_id,
      author: todo.author
        ? {
            id: todo.author.id,
            name: todo.author.name,
            todos: todo.author.todos.map((item: any) => ({ id: item.id, title: item.title, author_id: item.author_id })),
          }
        : null,
    }).toEqual({
      id: 1,
      title: 'First',
      author_id: 'p1',
      author: {
        id: 'p1',
        name: 'Ada',
        todos: [
          { id: 1, title: 'First', author_id: 'p1' },
          { id: 2, title: 'Second', author_id: 'p1' },
        ],
      },
    })
    expect(store.Profiles.peekFirst({ key: 'p1' }).todos.map((item: any) => ({ id: item.id, title: item.title, author_id: item.author_id }))).toEqual([
      { id: 1, title: 'First', author_id: 'p1' },
      { id: 2, title: 'Second', author_id: 'p1' },
    ])
    expect(client.request).toHaveBeenCalledTimes(3)
  })

  it('resolves every parent from one deduplicated author request, including key 0 and null FKs', async () => {
    const { store, client } = await createDirectusStack(schema)
    client.request.mockResolvedValueOnce([
      { id: 0, title: 'Zero', author_id: 'p0' },
      { id: 1, title: 'First author', author_id: 'p1' },
      { id: 2, title: 'Same author', author_id: 'p1' },
      { id: 3, title: 'Other author', author_id: 'p2' },
      { id: 4, title: 'Unassigned', author_id: null },
    ]).mockResolvedValueOnce([
      { id: 'p0', name: 'Grace' },
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Alan' },
    ])

    const todos = await store.Todos.findMany({ include: { author: true } })

    expect(todos.map((todo: any) => ({
      id: todo.id,
      title: todo.title,
      author: todo.author ? { id: todo.author.id, name: todo.author.name } : null,
    }))).toEqual([
      { id: 0, title: 'Zero', author: { id: 'p0', name: 'Grace' } },
      { id: 1, title: 'First author', author: { id: 'p1', name: 'Ada' } },
      { id: 2, title: 'Same author', author: { id: 'p1', name: 'Ada' } },
      { id: 3, title: 'Other author', author: { id: 'p2', name: 'Alan' } },
      { id: 4, title: 'Unassigned', author: null },
    ])
    expect(client.request.mock.calls.map(([request]) => request)).toEqual([
      { op: 'readItems', args: ['Todos', {}] },
      { op: 'readItems', args: ['Profiles', { filter: { id: { _in: expect.arrayContaining(['p0', 'p1', 'p2']) } } }] },
    ])
    expect(client.request.mock.calls[1]![0].args[1].filter.id._in).toHaveLength(3)
    expect(store.Profiles.peekMany().map((profile: any) => ({ id: profile.id, name: profile.name }))).toEqual([
      { id: 'p0', name: 'Grace' },
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Alan' },
    ])
  })

  it('waits for nested relation replies before resolving complete results, then serves cache reads', async () => {
    const { store, client } = await createDirectusStack(schema)
    const commentsReply = createDeferred<Array<{ id: string, todo_id: number, body: string }>>()
    client.request.mockResolvedValueOnce([
      { id: 'p1', name: 'Ada' },
      { id: 'p2', name: 'Alan' },
    ]).mockResolvedValueOnce([
      { id: 1, title: 'First', author_id: 'p1' },
      { id: 2, title: 'Second', author_id: 'p2' },
    ]).mockImplementationOnce(() => {
      return commentsReply.promise
    })

    let settled = false
    // Observe actual public Promise; an async hook helper can hide a missing await.
    const pending = store.Profiles.findMany({
      include: { todos: { include: { comments: true } } },
    }).then((result: any) => {
      settled = true
      return result
    }, (error: unknown) => {
      settled = true
      throw error
    })
    // Handle rejection while the external reply is held; assertions await it below.
    void pending.catch(() => {})
    try {
      await vi.waitFor(() => expect(client.request, 'nested comment request starts').toHaveBeenCalledTimes(3))
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(settled).toBe(false)
      expect(client.request.mock.calls.map(([request]) => request)).toEqual([
        { op: 'readItems', args: ['Profiles', {}] },
        { op: 'readItems', args: ['Todos', { filter: { author_id: { _in: expect.arrayContaining(['p1', 'p2']) } } }] },
        { op: 'readItems', args: ['Comments', { filter: { todo_id: { _in: expect.arrayContaining([1, 2]) } } }] },
      ])
      expect(client.request.mock.calls[1]![0].args[1].filter.author_id._in).toHaveLength(2)
      expect(client.request.mock.calls[2]![0].args[1].filter.todo_id._in).toHaveLength(2)
    }
    finally {
      commentsReply.resolve([
        { id: 'c1', todo_id: 1, body: 'Reviewed' },
        { id: 'c2', todo_id: 2, body: 'Approved' },
      ])
    }
    await vi.waitFor(() => expect(settled, 'nested relations complete the public read').toBe(true))
    const profiles = await pending
    expect(profiles.map((profile: any) => ({
      id: profile.id,
      todos: profile.todos.map((todo: any) => ({
        id: todo.id,
        title: todo.title,
        comments: todo.comments.map((comment: any) => ({ id: comment.id, body: comment.body })),
      })),
    }))).toEqual([
      { id: 'p1', todos: [{ id: 1, title: 'First', comments: [{ id: 'c1', body: 'Reviewed' }] }] },
      { id: 'p2', todos: [{ id: 2, title: 'Second', comments: [{ id: 'c2', body: 'Approved' }] }] },
    ])
    const cached = store.Todos.peekMany()
    expect(cached.map((todo: any) => ({ id: todo.id, comments: todo.comments.map((comment: any) => comment.body) }))).toEqual([
      { id: 1, comments: ['Reviewed'] },
      { id: 2, comments: ['Approved'] },
    ])
    expect(client.request).toHaveBeenCalledTimes(3)
  })

  it('rejects failed relation reads and allows a later uncached retry to resolve authors', async () => {
    const { store, client } = await createDirectusStack(schema)
    const outage = new Error('Directus profiles unavailable')
    client.request.mockResolvedValueOnce({ id: 1, title: 'Retry me', author_id: 'p1' })
      .mockRejectedValueOnce(outage)

    await expect(store.Todos.findFirst({ key: 1, include: { author: true } })).rejects.toBe(outage)
    expect(store.Profiles.peekMany()).toEqual([])

    client.request.mockResolvedValueOnce({ id: 1, title: 'Retry me', author_id: 'p1' })
      .mockResolvedValueOnce([{ id: 'p1', name: 'Ada' }])
    const todo = await store.Todos.findFirst({ key: 1, fetchPolicy: 'fetch-only', include: { author: true } })

    expect({ id: todo.id, title: todo.title, author: todo.author.name }).toEqual({ id: 1, title: 'Retry me', author: 'Ada' })
    expect(client.request.mock.calls.map(([request]) => request)).toEqual([
      { op: 'readItem', args: ['Todos', 1, {}] },
      { op: 'readItems', args: ['Profiles', { filter: { id: { _in: ['p1'] } } }] },
      { op: 'readItem', args: ['Todos', 1, {}] },
      { op: 'readItems', args: ['Profiles', { filter: { id: { _in: ['p1'] } } }] },
    ])
  })
})
