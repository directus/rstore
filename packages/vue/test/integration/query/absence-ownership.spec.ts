import { describe, expect, it, vi } from 'vitest'
import { setupLiveTodos, subscription } from '../../utils/live-query'

// Real mutation layers, queries and cache execute against the shared fake backend.
// Held remote writes distinguish optimistic membership from committed writes;
// separate live consumers distinguish page absence from shared remount refs.
describe('computed absence belongs to its page and follows optimistic layers', () => {
  it.each([false, true])('shows optimistic creation and restores absence on failure (%s)', async (reject) => {
    const { store, run, remote } = await setupLiveTodos({ data: { todos: [] }, experimentalGarbageCollection: false })
    const query = await run(() => store.todos.query((q: any) => q.first('1')))
    const other = await run(() => store.todos.query((q: any) => q.first('2')))
    const failure = new Error('Create rejected')
    if (reject)
      remote.failNext('createItem', failure)
    const release = remote.holdNext('createItem')
    const result = store.todos.create({ id: '1', title: 'Pending' }).then(() => undefined, (error: unknown) => error)
    try {
      await vi.waitFor(() => expect(remote.callCount('createItem')).toBe(1))
      expect(store.todos.peekFirst('1')?.$isOptimistic).toBe(true)
      expect(query.data.value?.title).toBe('Pending')
      expect(query.mainPage.data?.title).toBe('Pending')
      expect(other.data.value).toBeNull()
    }
    finally {
      release()
      expect(await result).toBe(reject ? failure : undefined)
    }
    expect(query.data.value?.title ?? null).toBe(reject ? null : 'Pending')
    expect(remote.rows('todos')).toEqual(reject ? [] : [{ id: '1', title: 'Pending' }])
    expect(query.confirmed.value).toBe(true)
  })

  it('restores authoritative absence over a retained row when an optimistic update rolls back', async () => {
    const { store, run, remote, payloads } = await setupLiveTodos({ experimentalGarbageCollection: false })
    const query = await run(() => store.todos.liveQuery((q: any) => q.first('1')))
    const payload = await subscription(payloads)
    const failure = new Error('Update rejected')
    remote.failNext('updateItem', failure)
    const release = remote.holdNext('updateItem')
    const result = store.todos.update({ id: '1', title: 'Pending' }).then(() => undefined, (error: unknown) => error)
    try {
      await vi.waitFor(() => expect(remote.callCount('updateItem')).toBe(1))
      expect(payload.setResult!(null, { version: 5 })).toBe('applied')
      expect(query.data.value?.title).toBe('Pending')
    }
    finally {
      release()
      expect(await result).toBe(failure)
    }
    expect(store.todos.peekFirst('1')?.title).toBe('One')
    expect(query.data.value).toBeNull()
    expect(query.mainPage.data).toBeNull()
  })

  it.each([true, false])('releases consumer absence for another page push and relevant local writes (keyed: %s)', async (keyed) => {
    const { store, run, payloads } = await setupLiveTodos({ experimentalGarbageCollection: false })
    /** An unkeyed first result may select any cached row after a local write. */
    const filter = () => true
    const first = await run(() => store.todos.liveQuery((q: any) => q.first(keyed ? '1' : { filter })))
    const second = await run(() => store.todos.liveQuery((q: any) => q.first(keyed ? '1' : { filter })))
    const firstPayload = await subscription(payloads)
    const secondPayload = await subscription(payloads, 1)
    expect(firstPayload.setResult!(null, { version: 5 })).toBe('applied')
    expect(first.data.value).toBeNull()
    expect(secondPayload.setResult!({ id: '1', title: 'One' }, { version: 4 })).toBe('applied')
    expect(second.data.value?.title).toBe('One')
    expect(first.data.value?.title).toBe('One')
    // Re-establish absence to distinguish keyed from collection-wide writes.
    expect(firstPayload.setResult!(null, { version: 6 })).toBe('applied')

    store.todos.writeItem({ id: '2', title: 'Unrelated' })
    expect(first.data.value?.title ?? null).toBe(keyed ? null : 'One')
    expect(first.mainPage.data).toEqual(first.data.value)
    store.todos.writeItem({ id: '1', title: 'Changed' })
    expect(first.data.value?.title).toBe('Changed')
    expect(second.data.value?.title).toBe('Changed')
    expect(first.confirmed.value).toBe(true)
  })

  it('releases owned absence when another page pushes the same frozen row', async () => {
    const { store, run, payloads } = await setupLiveTodos({ experimentalGarbageCollection: false })
    const first = await run(() => store.todos.liveQuery((q: any) => q.first('1')))
    const second = await run(() => store.todos.liveQuery((q: any) => q.first('1')))
    const firstPayload = await subscription(payloads)
    const secondPayload = await subscription(payloads, 1)
    const row = Object.freeze({ id: '1', title: 'Frozen' })
    store.todos.writeItem(row)
    expect(firstPayload.setResult!(null, { version: 5 })).toBe('applied')
    expect(secondPayload.setResult!(row, { version: 4 })).toBe('applied')
    expect(second.data.value?.title).toBe('Frozen')
    expect(row).toEqual({ id: '1', title: 'Frozen' })
    expect(first.data.value?.title).toBe('Frozen')
    expect(first.mainPage.data?.title).toBe('Frozen')
  })
})
