import type { Plugin, StoreSchema } from '@rstore/shared'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

// `form.spec.ts` and its four siblings are thorough on the op log, and mostly
// assert op-log *shape*. What none of them cover is the op log as a wire
// format: what a submit actually sends, what the backend does with it, and
// what the cache holds afterwards.

const schema: StoreSchema = [
  { name: 'posts' },
  {
    name: 'articles',
    relations: {
      tags: { many: true, to: { tags: { on: { article_id: 'id' } } } },
    },
  },
  { name: 'tags' },
]

/** Records the `formOperations` every mutation carries down to the plugins. */
function createOperationRecorder() {
  const calls: Array<{ mutation: string, item: Record<string, any>, formOperations: any[] }> = []
  const plugin: Plugin = {
    name: 'operation-recorder',
    setup({ hook }) {
      hook('beforeMutation', (payload: any) => {
        calls.push({
          mutation: payload.mutation,
          item: { ...payload.item },
          formOperations: payload.formOperations ?? [],
        })
      })
    },
  }
  return { plugin, calls, last: () => calls.at(-1)! }
}

/**
 * Applies a form op log to a backend row.
 *
 * `tags` stands for a to-many relation the backend persists as a list of ids,
 * the way a connector with relation-write support does
 * (`packages/monospace/src/runtime/relationWrites.ts`); every other field is
 * a plain column.
 *
 * @param row The row before the operations.
 * @param operations The operations to apply, in order.
 */
function applyFormOperations(row: Record<string, any>, operations: any[]): Record<string, any> {
  const next: Record<string, any> = { ...row, tagIds: [...(row.tagIds ?? [])] }
  for (const op of operations) {
    if (op.field !== 'tags') {
      next[op.field] = op.newValue
      continue
    }
    if (op.type === 'connect' && !next.tagIds.includes(op.newValue?.id)) {
      next.tagIds.push(op.newValue.id)
    }
    else if (op.type === 'disconnect') {
      next.tagIds = next.tagIds.filter((id: string) => id !== op.oldValue?.id)
    }
    else if (op.type === 'set') {
      next.tagIds = (op.newValue ?? []).map((item: any) => item.id)
    }
  }
  return next
}

/** Store with the fake remote plus the operation recorder. */
async function setup(data: Record<string, Array<Record<string, any>>>) {
  const recorder = createOperationRecorder()
  const stack = await createVueStack({ schema, data, plugins: [recorder.plugin] })
  return { ...stack, recorder }
}

/**
 * Store whose `articles` are written by applying the form operations the
 * submit carried, instead of the submitted item.
 *
 * Only such a backend can tell an optimized op log apart from a raw one, and
 * `on.updateItem` is how one deviating hook keeps the rest of the fake remote
 * — the call log, `failNext`, `holdNext` — intact.
 *
 * @param initial The row the backend starts from.
 */
async function setupRelationBackend(initial: Record<string, any>) {
  const recorder = createOperationRecorder()
  const stack = await createVueStack({
    schema,
    data: { articles: [{ ...initial, tagIds: [...(initial.tagIds ?? [])] }] },
    on: {
      updateItem: ctx => ctx.upsert(applyFormOperations(ctx.rows()[0]!, ctx.payload.formOperations ?? [])),
    },
    plugins: [recorder.plugin],
  })
  return {
    store: stack.store,
    /** The single `articles` row, as the backend currently holds it. */
    row: () => stack.remote.rows('articles')[0]!,
    recorder,
  }
}

describe('createForm submit', () => {
  it('sends the transformed data and publishes the server result to open queries', async () => {
    const { store, run, remote } = await setup({ posts: [{ id: 'p1', title: 'One' }] })
    const list = await run(() => store.posts.query((q: any) => q.many()))
    remote.respondNext('createItem', (item: any) => ({ ...item, id: 'srv-1', createdAt: '2026-01-01' }))

    const form = store.posts.createForm({
      defaultValues: () => ({ title: '  Spaced  ', draft: true }),
      transformData: (data: any) => ({ title: data.title.trim() }),
    })
    const created = await form.$submit()
    await nextTick()

    // Only the transformed payload crosses the wire.
    expect(remote.lastRequest('createItem')!.item).toEqual({ title: 'Spaced' })
    expect(created.id).toBe('srv-1')
    // The server-assigned fields land in the cache and in the open query.
    expect(remote.rows('posts')).toContainEqual({ id: 'srv-1', title: 'Spaced', createdAt: '2026-01-01' })
    const cached = list.data.value.find((post: any) => post.id === 'srv-1')
    expect(cached.createdAt).toBe('2026-01-01')
    expect(cached.title).toBe('Spaced')
  })
})

describe('updateForm submit', () => {
  it('sends only the changed fields with their operations and keeps the rest cached', async () => {
    const { store, remote, recorder } = await setup({
      posts: [{ id: 'p1', title: 'One', body: 'Body', tag: 'x' }],
    })
    const form = await store.posts.updateForm({ key: 'p1' })

    form.title = 'Edited'
    await form.$submit()
    await nextTick()

    expect(remote.lastRequest('updateItem')!.item).toEqual({ title: 'Edited' })
    expect(recorder.last().formOperations.map((op: any) => [op.field, op.type, op.newValue]))
      .toEqual([['title', 'set', 'Edited']])
    // Fields the submit never mentioned are still there.
    const cached = store.posts.peekFirst('p1')
    expect(cached.title).toBe('Edited')
    expect(cached.body).toBe('Body')
    expect(cached.tag).toBe('x')
  })

  it('keeps the edits, the dirty state and the previous item when the submit fails', async () => {
    const { store, remote } = await setup({ posts: [{ id: 'p1', title: 'One', body: 'Body' }] })
    await store.posts.findFirst({ key: 'p1' })
    const form = await store.posts.updateForm({ key: 'p1' })

    form.title = 'Edited'
    remote.failNext('updateItem')
    await expect(form.$submit()).rejects.toThrow('fake-remote: updateItem failed')
    await nextTick()

    expect(form.title).toBe('Edited')
    expect(form.$hasChanges()).toBe(true)
    expect(form.$error).toBeInstanceOf(Error)
    // The optimistic layer is gone, so the cache shows the server value again.
    expect(store.posts.peekFirst('p1').title).toBe('One')
    expect(remote.rows('posts')[0]!.title).toBe('One')
  })
})

describe('op log as a wire format', () => {
  it('reaches the same backend state from the optimized log as from the raw log', async () => {
    const initial = { id: 'a1', title: 'Original', tagIds: [] as string[] }
    const { store, row } = await setupRelationBackend(initial)
    const form = await store.articles.updateForm({ key: 'a1' })

    form.title = 'First'
    form.title = 'Second'
    form.tags.$connect({ id: 't1' })
    form.tags.$disconnect({ id: 't1' })
    form.tags.$connect({ id: 't2' })

    const raw = form.$opLog.getAll()
    // Guards that the sequence is one optimization actually collapses.
    expect(raw.length).toBeGreaterThan(form.$opLog.getOptimized().length)

    await form.$submit()

    // The property that matters: same backend state, whichever log is sent.
    expect(row()).toEqual(applyFormOperations(initial, raw))
    expect(row().title).toBe('Second')
    expect(row().tagIds).toEqual(['t2'])
  })

  it('carries relation connects and disconnects down to the backend', async () => {
    const { store, row, recorder } = await setupRelationBackend({ id: 'a1', title: 'Original', tagIds: ['t0'] })
    const form = await store.articles.updateForm({ key: 'a1' })

    form.tags.$connect({ id: 't1' })
    form.tags.$connect({ id: 't2' })
    form.tags.$disconnect({ id: 't1' })
    await form.$submit()

    expect(recorder.last().formOperations.map((op: any) => [op.field, op.type, op.newValue?.id]))
      .toEqual([['tags', 'connect', 't2']])
    expect(row().tagIds).toEqual(['t0', 't2'])
  })
})

describe('a realtime frame during an edit', () => {
  it('rebases the untouched fields and keeps the local edit on a touched one', async () => {
    const { store, run, remote } = await setup({
      posts: [{ id: 'p1', title: 'Server title', body: 'Server body' }],
    })
    const list = await run(() => store.posts.liveQuery((q: any) => q.many()))
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(1))
    const form = await store.posts.updateForm({ key: 'p1' })
    form.title = 'Local title'

    // The frame goes through the plugin path, i.e. `$cache.writeItem`.
    remote.emit({ type: 'updated', collection: 'posts', item: { id: 'p1', body: 'Remote body' } })
    await nextTick()
    form.$rebase({ ...store.posts.peekFirst('p1') })

    expect(form.title).toBe('Local title')
    expect(form.body).toBe('Remote body')
    expect(form.$changedProps).toEqual({ title: ['Local title', 'Server title'] })
    expect(list.data.value[0]!.body).toBe('Remote body')
  })

  it('does not clobber the fields of a pending submit', async () => {
    const { store, run, remote } = await setup({
      posts: [{ id: 'p1', title: 'Server title', body: 'Server body' }],
    })
    await run(() => store.posts.liveQuery((q: any) => q.many()))
    await vi.waitFor(() => expect(remote.subscriptions()).toHaveLength(1))
    const form = await store.posts.updateForm({ key: 'p1' })

    form.title = 'Submitted title'
    const release = remote.holdNext('updateItem')
    const submitting = form.$submit()
    await vi.waitFor(() => expect(remote.callCount('updateItem')).toBe(1))

    // Both land while the submit is in flight.
    form.body = 'Edited during submit'
    remote.emit({ type: 'updated', collection: 'posts', item: { id: 'p1', tag: 'from-realtime' } })
    release()
    await submitting
    await nextTick()

    // Regression for `5ad3c18`: the reset used to drop the edits made after
    // the submit started.
    expect(form.body).toBe('Edited during submit')
    expect(form.$changedProps).toEqual({ body: ['Edited during submit', 'Server body'] })
    expect(form.title).toBe('Submitted title')
    expect(remote.rows('posts')[0]).toEqual({
      id: 'p1',
      title: 'Submitted title',
      body: 'Server body',
      tag: 'from-realtime',
    })
  })
})
