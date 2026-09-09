import type { CoreStackOptions } from '#test-utils/store/coreStack'
import type { FakeRemoteHandlerContext, FakeRemoteHandlers } from '#test-utils/store/fakeRemote'
import type { FormOperation } from '@rstore/shared'
import { createItem, updateItem } from '@rstore/core'
import { describe, expect, it } from 'vitest'
import { batchStack } from './utils/batching'

/** Junction rows the fake connector writes for the `tags` many-relation. */
const JUNCTION = 'todoTags'

/** One dispatch the fake connector answered, with the operations it received. */
interface SeenDispatch {
  /** Item whose relation edits reached the connector. */
  key: string | number
  /** Form operations supplied for this individual mutation. */
  operations?: FormOperation[]
}

/**
 * A fake connector that materialises `tags` form operations as junction rows.
 *
 * It answers the single-item hooks and both batch tiers from the same code, so
 * a route that drops the operations loses the junction rows a connector would
 * have written, whatever tier answered the mutation.
 */
function tagLinkConnector() {
  const seen: SeenDispatch[] = []

  /** Records one dispatch and applies the relation edits it carries. */
  function link(ctx: FakeRemoteHandlerContext, key: string | number, operations?: FormOperation[]) {
    seen.push({ key, operations })
    for (const operation of operations ?? []) {
      if (operation.field !== 'tags') {
        continue
      }
      if (operation.type === 'connect') {
        ctx.upsert({ id: `${key}:${operation.newValue.id}`, todoId: key, tagId: operation.newValue.id }, JUNCTION)
      }
      else if (operation.type === 'disconnect') {
        ctx.remove(`${key}:${operation.oldValue.id}`, JUNCTION)
      }
    }
  }

  /** Applies the relation edits of every mutation of a batch, per operation. */
  function linkBatch(ctx: FakeRemoteHandlerContext) {
    const operations = ctx.payload.mutations ?? ctx.payload.operations
    for (const operation of operations) {
      link(ctx, operation.key ?? operation.item.id, operation.formOperations)
    }
    return ctx.next()
  }

  const handlers: FakeRemoteHandlers = {
    createItem: (ctx) => {
      link(ctx, ctx.item!.id, ctx.payload.formOperations)
      return ctx.next()
    },
    updateItem: (ctx) => {
      link(ctx, ctx.key!, ctx.payload.formOperations)
      return ctx.next()
    },
    batch: linkBatch,
    batchMutate: linkBatch,
  }

  return { seen, handlers }
}

/** A `connect` operation on the `tags` relation, as a form submission emits it. */
function connectTag(id: string): FormOperation {
  return { timestamp: 1, type: 'connect', field: 'tags', newValue: { id }, oldValue: undefined }
}

/** A `disconnect` operation on the `tags` relation. */
function disconnectTag(id: string): FormOperation {
  return { timestamp: 2, type: 'disconnect', field: 'tags', newValue: undefined, oldValue: { id } }
}

/**
 * The four routes a mutation can take to a connector. Every one of them has to
 * hand over the same form operations.
 */
const ROUTES: Array<[string, Partial<CoreStackOptions>]> = [
  // No scheduler: the mutation calls the individual hook itself.
  ['direct', { batching: false }],
  // Batched, but no batch hook answers, so the batch falls back to the
  // individual hook.
  ['unresolved fallback', { batch: false }],
  ['handled batch', {}],
  ['unified batch', { batch: ['batch'] }],
]

describe('form operations of batched mutations', () => {
  it.each(ROUTES)('sends create form operations through the %s route', async (_route, options) => {
    const connector = tagLinkConnector()
    const stack = await batchStack({ on: connector.handlers, ...options })
    const operations = [connectTag('a')]

    await createItem({
      store: stack.store,
      collection: stack.collection('todos'),
      item: { id: '1', title: 'One' } as any,
      formOperations: operations,
    })

    expect(connector.seen).toEqual([{ key: '1', operations }])
    expect(stack.remote.rows(JUNCTION)).toEqual([{ id: '1:a', todoId: '1', tagId: 'a' }])
    expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'One' }])
    expect(stack.read('todos', '1')).toMatchObject({ id: '1', title: 'One' })
  })

  it.each(ROUTES)('sends update form operations through the %s route', async (_route, options) => {
    const connector = tagLinkConnector()
    const stack = await batchStack({
      on: connector.handlers,
      data: { todos: [{ id: '1', title: 'One' }], [JUNCTION]: [{ id: '1:a', todoId: '1', tagId: 'a' }] },
      ...options,
    })
    const operations = [disconnectTag('a'), connectTag('b')]

    await updateItem({
      store: stack.store,
      collection: stack.collection('todos'),
      key: '1',
      item: { title: 'One!' } as any,
      formOperations: operations,
    })

    expect(connector.seen).toEqual([{ key: '1', operations }])
    expect(stack.remote.rows(JUNCTION)).toEqual([{ id: '1:b', todoId: '1', tagId: 'b' }])
    expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'One!' }])
    expect(stack.read('todos', '1')?.title).toBe('One!')
  })

  it('keeps the form operations of each mutation grouped into one batch', async () => {
    const connector = tagLinkConnector()
    const stack = await batchStack({ on: connector.handlers })
    const collection = stack.collection('todos')
    const first = [connectTag('a')]
    const second = [connectTag('b'), connectTag('c')]

    await Promise.all([
      createItem({ store: stack.store, collection, item: { id: '1', title: 'One' } as any, formOperations: first }),
      createItem({ store: stack.store, collection, item: { id: '2', title: 'Two' } as any, formOperations: second }),
    ])

    // One dispatch key, but each operation of it keeps its own payload.
    expect(stack.remote.callCount('batchMutate')).toBe(1)
    expect(connector.seen).toEqual([
      { key: '1', operations: first },
      { key: '2', operations: second },
    ])
    expect(stack.remote.rows(JUNCTION).map(row => row.id)).toEqual(['1:a', '2:b', '2:c'])
  })

  it('leaves a mutation without form operations undefined', async () => {
    const connector = tagLinkConnector()
    const stack = await batchStack({ on: connector.handlers })

    await createItem({
      store: stack.store,
      collection: stack.collection('todos'),
      item: { id: '1', title: 'One' } as any,
    })

    expect(connector.seen).toEqual([{ key: '1', operations: undefined }])
    expect(stack.remote.rows(JUNCTION)).toEqual([])
  })
})
