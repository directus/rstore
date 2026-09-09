import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

/** A real editor and subscribed reader sharing persisted document state. */
async function setup() {
  const stack = await createVueStack({
    schema: [{ name: 'documents' }],
    data: { documents: [{ id: '1', body: 'Hello world', count: 0, status: 'draft' }] },
  })
  const query = await stack.run(() => stack.store.documents.liveQuery((q: any) => q.first('1')))
  await vi.waitFor(() => expect(stack.remote.subscriptions()).toHaveLength(1))
  const form = await stack.store.documents.updateForm('1')
  /** Deliver backend changes through realtime, then use the public editor rebase API. */
  async function updateRemote(item: Record<string, unknown>) {
    stack.remote.emit({ type: 'updated', collection: 'documents', item: { id: '1', ...item } })
    await nextTick()
    form.$rebase({ ...stack.store.documents.peekFirst('1') })
  }
  return { stack, query, form, updateRemote }
}

describe('form rebase workflows', () => {
  it('rebases final text after an intermediate null edit and keeps undo usable', async () => {
    const { stack, form, updateRemote } = await setup()
    form.body = null
    form.body = 'Hello brave world'
    await updateRemote({ body: 'Hello world!' })
    expect(form.body).toBe('Hello brave world!')
    expect(form.$conflicts).toEqual([])
    expect(form.$opLog.undo()).toBe(true)
    expect(form.body).toBe('Hello world!')
    expect(form.$opLog.redo()).toBe(true)
    expect(form.body).toBe('Hello brave world!')
    await form.$submit()
    expect(stack.remote.rows('documents')[0]!.body).toBe('Hello brave world!')
  })

  it('merges text edits, preserves undo and redo, then persists the visible result', async () => {
    const { stack, query, form, updateRemote } = await setup()
    form.body = 'Hello brave world'
    form.body = 'Hello brave new world'
    await updateRemote({ body: 'Hello world!', status: 'review' })

    expect(form.body).toBe('Hello brave new world!')
    expect(form.status).toBe('review')
    expect(form.$conflicts).toEqual([])
    expect(form.$opLog.undo()).toBe(true)
    expect(form.body).toBe('Hello brave world!')
    expect(form.$opLog.undo()).toBe(true)
    expect(form.body).toBe('Hello world!')
    expect(form.$opLog.redo()).toBe(true)
    expect(form.body).toBe('Hello brave world!')
    await form.$submit()

    expect(stack.remote.lastRequest('updateItem')!.item).toEqual({ body: 'Hello brave world!' })
    expect(stack.remote.rows('documents')[0]).toMatchObject({ body: 'Hello brave world!', status: 'review' })
    expect(query.data.value).toMatchObject({ body: 'Hello brave world!', status: 'review' })
    expect(form.$hasChanges()).toBe(false)
  })

  it.each(['local', 'remote'] as const)('resolves competing scalar edits with the %s value before submit', async (resolution) => {
    const { stack, query, form, updateRemote } = await setup()
    form.count = 1
    form.status = 'local-status'
    await updateRemote({ count: 2 })
    expect(form.$conflicts).toEqual([expect.objectContaining({ field: 'count', localValue: 1, remoteValue: 2 })])
    form.$resolveConflict('count', resolution)
    expect(form.count).toBe(resolution === 'local' ? 1 : 2)
    expect(form.$conflicts).toEqual([])
    await form.$submit()

    const expected = { count: resolution === 'local' ? 1 : 2, status: 'local-status' }
    expect(stack.remote.rows('documents')[0]).toMatchObject(expected)
    expect(query.data.value).toMatchObject(expected)
    expect(stack.remote.lastRequest('updateItem')!.item).toEqual(resolution === 'local' ? expected : { status: 'local-status' })
  })

  it('does not submit a field whose local and remote edits converge', async () => {
    const { stack, form, updateRemote } = await setup()
    form.count = 3
    form.status = 'ready'
    await updateRemote({ count: 3 })
    expect(form.count).toBe(3)
    expect(form.$conflicts).toEqual([])
    expect(form.$changedProps).toEqual({ status: ['ready', 'draft'] })
    await form.$submit()
    expect(stack.remote.lastRequest('updateItem')!.item).toEqual({ status: 'ready' })
    expect(stack.remote.rows('documents')[0]).toMatchObject({ count: 3, status: 'ready' })
  })

  it('resolves overlapping text edits without dropping an unrelated local field', async () => {
    const { stack, form, updateRemote } = await setup()
    form.body = 'Hello planet'
    form.count = 4
    await updateRemote({ body: 'Hello there' })
    expect(form.$conflicts).toEqual([expect.objectContaining({ field: 'body', localValue: 'Hello planet', remoteValue: 'Hello there' })])
    form.$resolveConflict('body', 'remote')
    expect(form.body).toBe('Hello there')
    expect(form.count).toBe(4)
    await form.$submit()
    expect(stack.remote.lastRequest('updateItem')!.item).toEqual({ count: 4 })
    expect(stack.remote.rows('documents')[0]).toMatchObject({ body: 'Hello there', count: 4 })
  })
})
