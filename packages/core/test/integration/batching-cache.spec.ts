import type { FakeRemote } from '#test-utils/store/fakeRemote'
import type { Plugin } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { createItem, findFirst, updateItem } from '@rstore/core'
import { describe, expect, it } from 'vitest'

// `packages/core/test/batch/*` covers the scheduler thoroughly, but on the same
// mock store: what a batch does to the *cache* is never asserted. This file
// re-proves the end-to-end contract — one batch call in, four cache writes out —
// against the real cache.

/** One recorded call of the unified `batch` hook. */
interface RecordedBatch {
  group: string
  types: string[]
}

/** A batch-capable backend, resolving every operation of a batch at once. */
interface BatchBackend {
  /** The rstore plugin implementing the `batch` hook. */
  plugin: Plugin
  /** Every batch the scheduler dispatched, in order. */
  calls: RecordedBatch[]
  /** Rows answered to batched fetches, as they stood when the batch ran. */
  reads: Array<Record<string, any> | undefined>
  /** Makes the batched create of an item with this id fail. */
  rejectCreate: (id: string) => void
}

/**
 * Creates a plugin that answers whole batches from the fake remote's rows.
 *
 * The fake remote only implements the per-item hooks, so a batch would fall
 * through to them one call at a time — exactly what these tests must be able
 * to tell apart.
 *
 * @param remote The fake remote whose rows the batch reads and writes.
 */
function createBatchBackend(remote: FakeRemote): BatchBackend {
  const calls: RecordedBatch[] = []
  const reads: Array<Record<string, any> | undefined> = []
  const rejected = new Set<string>()

  /** Applies one batched operation to the fake remote's rows. */
  function apply(operation: any) {
    const name = operation.collection.name
    const rows = remote.rows(name)
    const index = rows.findIndex(row => row.id === operation.key)

    switch (operation.type) {
      case 'fetchFirst':
        reads.push(rows[index])
        operation.setResult(rows[index])
        return

      case 'create': {
        const id = operation.item?.id
        if (typeof id === 'string' && rejected.has(id)) {
          operation.setError(new Error(`batch rejected ${id}`))
          return
        }
        const row = { ...operation.item }
        remote.seed(name, [...rows, row])
        operation.setResult(row)
        return
      }

      case 'update': {
        const row = { ...rows[index], ...operation.item, id: operation.key }
        remote.seed(name, index === -1 ? [...rows, row] : rows.with(index, row))
        operation.setResult(row)
        return
      }

      case 'delete':
        remote.seed(name, rows.filter(row => row.id !== operation.key))
        operation.setResult(undefined)
    }
  }

  return {
    calls,
    reads,
    rejectCreate: id => rejected.add(id),
    plugin: {
      name: 'batch-backend',
      category: 'local',
      setup({ hook }: any) {
        hook('batch', ({ group, operations }: any) => {
          calls.push({
            group,
            types: operations.map((operation: any) => operation.type),
          })
          operations.forEach(apply)
        })
      },
    },
  }
}

/** Core store with batching on, a batch backend and a fake remote fallback. */
async function setupBatch(options: { data?: Record<string, Array<Record<string, any>>>, delay?: number } = {}) {
  let backend!: BatchBackend
  const stack = await createCoreStack({
    schema: [{ name: 'todos' }],
    batching: options.delay == null ? true : { delay: options.delay },
    data: options.data,
    plugins: (remote) => {
      backend = createBatchBackend(remote)
      return [backend.plugin]
    },
  })
  return { stack, backend }
}

describe('one batch, four cache writes', () => {
  it('groups four mutations of a tick into a single batch call', async () => {
    const { stack, backend } = await setupBatch()

    await Promise.all(['1', '2', '3', '4'].map(id => createItem({
      store: stack.store,
      collection: stack.collection('todos'),
      item: { id, title: `Todo ${id}` } as any,
    })))

    expect(backend.calls).toHaveLength(1)
    expect(backend.calls[0]).toEqual({ group: 'default', types: ['create', 'create', 'create', 'create'] })
    // The per-item hooks of the fake remote never ran: the batch owned them.
    expect(stack.remote.callCount('createItem')).toBe(0)
    expect(stack.remote.rows('todos').map(row => row.id)).toEqual(['1', '2', '3', '4'])
    expect(stack.readMany('todos').map(item => item.id)).toEqual(['1', '2', '3', '4'])
  })
})

describe('partial batch failure', () => {
  it('writes the siblings and rolls back only the failing key', async () => {
    const { stack, backend } = await setupBatch()
    backend.rejectCreate('3')

    const settled = await Promise.allSettled(['1', '2', '3', '4'].map(id => createItem({
      store: stack.store,
      collection: stack.collection('todos'),
      item: { id, title: `Todo ${id}` } as any,
    })))

    expect(settled.map(entry => entry.status)).toEqual(['fulfilled', 'fulfilled', 'rejected', 'fulfilled'])
    expect((settled[2] as PromiseRejectedResult).reason.message).toBe('batch rejected 3')
    expect(stack.readMany('todos').map(item => item.id)).toEqual(['1', '2', '4'])
    // The failed create left no optimistic remnant behind.
    expect(stack.read('todos', '3')).toBeUndefined()
  })
})

describe('mixed fetch and mutation in one batch', () => {
  it('keeps the fetch before the mutation enqueued after it', async () => {
    const { stack, backend } = await setupBatch({
      data: { todos: [{ id: '1', title: 'One' }] },
      delay: 1,
    })
    const collection = stack.collection('todos')

    await Promise.all([
      findFirst({ store: stack.store, collection, findOptions: { key: '1', fetchPolicy: 'fetch-only' } }),
      updateItem({ store: stack.store, collection, key: '1', item: { title: 'Two' } as any }),
    ])

    expect(backend.calls).toHaveLength(1)
    expect(backend.calls[0]!.types).toEqual(['fetchFirst', 'update'])
    // The fetch ran against the rows as they stood before the update...
    expect(backend.reads).toEqual([{ id: '1', title: 'One' }])
    // ...and the mutation, enqueued after it, is what the cache ends up with.
    expect(stack.read('todos', '1')!.title).toBe('Two')
    expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'Two' }])
  })
})

describe('per-call opt out', () => {
  it('bypasses the scheduler with batch: false', async () => {
    const { stack, backend } = await setupBatch()

    await createItem({
      store: stack.store,
      collection: stack.collection('todos'),
      item: { id: '1', title: 'Direct' } as any,
      batch: false,
    })

    expect(backend.calls).toEqual([])
    // Straight to the individual hook of the remote instead.
    expect(stack.remote.callCount('createItem')).toBe(1)
    expect(stack.read('todos', '1')).toMatchObject({ id: '1', title: 'Direct' })
  })
})
