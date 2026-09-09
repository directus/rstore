import type { CoreStack, CoreStackOptions } from '#test-utils/store/coreStack'
import type { UpdateOptions } from '@rstore/core'
import type { Plugin, StoreSchema } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { createItem, deleteItem, updateItem } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'

const schema: StoreSchema = [{ name: 'todos' }]
type SetupOptions = Omit<CoreStackOptions, 'schema'> & { schema?: StoreSchema }

function setup({ schema: collections = schema, ...options }: SetupOptions = {}) {
  return createCoreStack({ schema: collections, ...options })
}

function create(stack: CoreStack, item: Record<string, any>) {
  return createItem({ store: stack.store, collection: stack.collection('todos'), item: item as any })
}

function update(stack: CoreStack, key: string | number | null, item: Record<string, any>, options: Partial<UpdateOptions<any, any, any>> = {}) {
  return updateItem({ ...options, store: stack.store, collection: stack.collection('todos'), key, item: item as any })
}

const preventedMutationCases = [
  {
    name: 'update',
    dispatch: (stack: CoreStack) => update(stack, '1', { title: 'Blocked' }),
    remoteHook: 'updateItem',
    error: 'Item update prevented by the layer',
  },
  {
    name: 'delete',
    dispatch: (stack: CoreStack) => deleteItem({ store: stack.store, collection: stack.collection('todos'), key: '1' }),
    remoteHook: 'deleteItem',
    error: 'Item deletion prevented by the layer',
  },
] as const

function silent(hook: 'updateItem'): Plugin {
  return {
    name: 'silent',
    setup({ hook: on }: any) {
      on(hook, () => {})
    },
  }
}

function answering(name: string, answer: (payload: any) => void): Plugin {
  return {
    name,
    setup({ hook }: any) {
      hook('updateItem', answer)
    },
  }
}

function describeUpdateArbitration() {
  function stackWith(first: (payload: any) => void, second: (payload: any) => void) {
    return setup({ remote: false, plugins: [answering('first', first), answering('second', second)] })
  }

  it('stops at the first plugin that answers', async () => {
    const stack = await stackWith(
      ({ setResult }) => setResult({ id: '1', title: 'First' }),
      ({ setResult }) => setResult({ id: '1', title: 'Second' }),
    )
    expect((await update(stack, '1', { title: 'Input' })).title).toBe('First')
  })

  it('lets a later plugin answer when setResult opts out of aborting', async () => {
    const stack = await stackWith(
      ({ setResult }) => setResult({ id: '1', title: 'First' }, { abort: false }),
      ({ setResult }) => setResult({ id: '1', title: 'Second' }),
    )
    expect((await update(stack, '1', { title: 'Input' })).title).toBe('Second')
  })

  it('keeps going after setResult(null)', async () => {
    const stack = await stackWith(
      ({ setResult }) => setResult(null),
      ({ setResult }) => setResult({ id: '1', title: 'Second' }),
    )
    expect((await update(stack, '1', { title: 'Input' })).title).toBe('Second')
  })

  it('stops on abort() after a non-aborting result', async () => {
    const stack = await stackWith(
      ({ setResult, abort }) => {
        setResult({ id: '1', title: 'First' }, { abort: false })
        abort()
      },
      ({ setResult }) => setResult({ id: '1', title: 'Second' }),
    )
    expect((await update(stack, '1', { title: 'Input' })).title).toBe('First')
  })
}

describe('updateItem', () => {
  it('rejects before any request when neither the options nor item has a key', async () => {
    const stack = await setup({ data: { todos: [{ id: '1', title: 'One' }] } })
    await expect(update(stack, null, { title: 'Renamed' })).rejects.toThrow('Item update failed: key is not defined')
    expect(stack.remote.callCount('updateItem')).toBe(0)
  })

  it('accepts a falsy key and respects an explicit key over item id', async () => {
    const stack = await setup({ data: { todos: [{ id: 0, title: 'Zero' }, { id: '1', title: 'One' }] } })
    await update(stack, 0, { title: 'Renamed' })
    await update(stack, '1', { id: 'other', title: 'Explicit' })
    expect(stack.read('todos', 0)).toMatchObject({ title: 'Renamed' })
    expect(stack.remote.lastRequest('updateItem')!.key).toBe('1')
  })

  it('falls back to a cached item when no plugin answers, but rejects an empty cache', async () => {
    const cached = await setup({ remote: false, plugins: [silent('updateItem')] })
    cached.cache.writeItem({ collection: cached.collection('todos'), key: '1', item: { id: '1', title: 'Cached' } })
    expect(await update(cached, '1', { title: 'Renamed' })).toMatchObject({ title: 'Cached' })

    const empty = await setup({ remote: false, plugins: [silent('updateItem')] })
    await expect(update(empty, '1', { title: 'Renamed' })).rejects.toThrow('Item update failed: result is nullish')
  })

  it('removes the optimistic layer on commit and leaves cache unchanged with skipCache', async () => {
    const stack = await setup({ data: { todos: [{ id: '1', title: 'One' }] } })
    stack.remote.respondNext('updateItem', () => ({ id: '1', title: 'Server' }))
    await update(stack, '1', { title: 'Optimistic' })
    expect(stack.read('todos', '1')!.title).toBe('Server')

    stack.cache.writeItem({ collection: stack.collection('todos'), key: '1', item: { id: '1', title: 'One' } })
    await update(stack, '1', { title: 'Uncached' }, { skipCache: true })
    expect(stack.read('todos', '1')!.title).toBe('One')
  })

  describeUpdateArbitration()
})

describe('deleteItem', () => {
  it('names the backend row by mutation key and supports plugin abort', async () => {
    const stack = await setup({ data: { todos: [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }] } })
    await deleteItem({ store: stack.store, collection: stack.collection('todos'), key: '1' })
    expect(stack.remote.lastRequest('deleteItem')!.key).toBe('1')

    const vetoed = await setup({
      data: { todos: [{ id: '1', title: 'One' }] },
      plugins: [{ name: 'veto', before: { plugins: ['fake-remote'] }, setup({ hook }: any) { hook('deleteItem', ({ abort }: any) => abort()) } }],
    })
    await deleteItem({ store: vetoed.store, collection: vetoed.collection('todos'), key: '1' })
    expect(vetoed.remote.callCount('deleteItem')).toBe(0)
  })
})

describe('prevented mutations', () => {
  it.each(preventedMutationCases)('refuses a $name while a real optimistic create layer prevents it', async ({ dispatch, remoteHook, error: expectedError }) => {
    const stack = await setup({ data: { todos: [{ id: '1', title: 'Stored' }] } })
    stack.cache.writeItem({ collection: stack.collection('todos'), key: '1', item: { id: '1', title: 'Stored' } })
    const release = stack.remote.holdNext('createItem')
    const pending = create(stack, { id: '1', title: 'Pending' })
    await vi.waitFor(() => expect(stack.remote.callCount('createItem')).toBe(1))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(dispatch(stack))
        .rejects
        .toThrow(expectedError)
      expect(stack.remote.callCount(remoteHook)).toBe(0)
      expect(stack.read('todos', '1')).toMatchObject({ id: '1', title: 'Pending' })
      expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'Stored' }])
    }
    finally {
      error.mockRestore()
      release()
      await pending
    }
    expect(stack.read('todos', '1')).toMatchObject({ id: '1', title: 'Pending' })
    expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'Pending' }])
  })
})
