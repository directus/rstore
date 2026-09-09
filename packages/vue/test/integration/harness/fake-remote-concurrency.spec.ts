import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { harnessSchema, harnessTodos } from './shared'

describe('fake remote concurrent scripts', () => {
  it('reserves a failure and response for the first call even when it finishes last', async () => {
    const { store, remote } = await createVueStack({ schema: harnessSchema, data: harnessTodos() })
    const error = new Error('first request failed')
    const responder = vi.fn(() => ({ id: 'unexpected', title: 'Wrong request' }))
    const release = remote.holdNext('fetchFirst')
    remote.failNext('fetchFirst', error)
    remote.respondNext('fetchFirst', responder)
    const first = Promise.allSettled([store.todos.findFirst({ key: '1', fetchPolicy: 'fetch-only' })])

    try {
      await vi.waitFor(() => expect(remote.callCount('fetchFirst')).toBe(1))
      const second = await store.todos.findFirst({ key: '2', fetchPolicy: 'fetch-only' })
      expect(second.title).toBe('Two')
    }
    finally {
      release()
      await first
    }

    expect(await first).toEqual([{ status: 'rejected', reason: error }])
    expect(responder).not.toHaveBeenCalled()
    expect(store.todos.peekFirst('1')).toBeNull()
    expect(store.todos.peekFirst('2').title).toBe('Two')
    expect(remote.rows('todos')).toEqual(harnessTodos().todos)
  })

  it('applies a reserved create response once to its own backend row and cache item', async () => {
    const { store, remote } = await createVueStack({ schema: harnessSchema })
    const responder = vi.fn(item => ({ ...item, id: 'server-assigned' }))
    const release = remote.holdNext('createItem')
    remote.respondNext('createItem', responder)
    const first = store.todos.create({ id: '1', title: 'First' })

    try {
      await vi.waitFor(() => expect(remote.callCount('createItem')).toBe(1))
      const second = await store.todos.create({ id: '2', title: 'Second' })
      expect(second.id).toBe('2')
      expect(responder).not.toHaveBeenCalled()
    }
    finally {
      release()
      await first
    }

    expect((await first).id).toBe('server-assigned')
    expect(responder).toHaveBeenCalledExactlyOnceWith(
      { id: '1', title: 'First' },
      expect.objectContaining({ hook: 'createItem', item: { id: '1', title: 'First' } }),
    )
    expect(remote.rows('todos')).toEqual([
      { id: '2', title: 'Second' },
      { id: 'server-assigned', title: 'First' },
    ])
    expect(store.todos.peekFirst('1')).toBeNull()
    expect(store.todos.peekFirst('2').title).toBe('Second')
    expect(store.todos.peekFirst('server-assigned').title).toBe('First')
  })
})
