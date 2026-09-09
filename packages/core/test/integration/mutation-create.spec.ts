import type { CoreStack, CoreStackOptions } from '#test-utils/store/coreStack'
import type { CreateOptions } from '@rstore/core'
import type { Plugin, StoreSchema } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { createItem } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'

// `test/mutation/{create,update,delete}.spec.ts` drove these three paths with a
// `$cache` made of `vi.fn()`s, so every cache claim was a claim about a spy:
// "addLayer was called" could not tell an optimistic value a read can see from
// one filed under the wrong key, and "applyMutation was not called" could not
// tell `skipCache` from a mutation that silently did nothing. Everything here
// is asserted through a cache read, the backend rows or a recorded request.

const schema: StoreSchema = [{ name: 'todos' }]

/** Collection whose `tags` field has a distinct wire and in-memory shape. */
const serializingSchema: StoreSchema = [{
  name: 'todos',
  fields: {
    tags: {
      parse: (value: string) => value.split(','),
      serialize: (value: string[]) => value.join(','),
    },
  },
}]

/** Options of {@link setup}, with the `todos` schema as the default. */
type SetupOptions = Omit<CoreStackOptions, 'schema'> & { schema?: StoreSchema }

/** Core stack on a `todos` collection. */
function setup({ schema: collections = schema, ...options }: SetupOptions = {}) {
  return createCoreStack({ schema: collections, ...options })
}

/** `createItem` on the stack's `todos` collection. */
function create(stack: CoreStack, item: Record<string, any>, options: Partial<CreateOptions<any, any, any>> = {}) {
  return createItem({ ...options, store: stack.store, collection: stack.collection('todos'), item: item as any })
}

/**
 * Plugin that registers `hook` and never calls `setResult`.
 *
 * The legal way to produce a nullish result — a boundary of the mutation path,
 * not a mock of one of its siblings.
 */
function silent(hook: 'createItem'): Plugin {
  return {
    name: 'silent',
    setup({ hook: on }: any) {
      on(hook, () => {})
    },
  }
}

/** Plugin answering `hook`, ordered by its position in the plugin list. */
function answering(name: string, hook: 'createItem', answer: (payload: any) => void): Plugin {
  return {
    name,
    setup({ hook: on }: any) {
      on(hook, answer)
    },
  }
}

/**
 * The four `setResult` / `abort()` outcomes, run against one mutation.
 *
 * `create.ts` and `update.ts` each build their own `setResult` closure, so a
 * divergence between the two copies is exactly what these catch. The winner is
 * read back out of the cache rather than counted on a spy.
 */
function describeArbitration(hook: 'createItem', mutate: (stack: CoreStack) => Promise<any>) {
  /** Stack whose only plugins are the two competing answerers, in order. */
  function stackWith(first: (payload: any) => void, second: (payload: any) => void) {
    return setup({ remote: false, plugins: [answering('first', hook, first), answering('second', hook, second)] })
  }

  /** Runs the mutation and reports the title both it and the cache show. */
  async function titles(stack: CoreStack) {
    const result = await mutate(stack)
    return [result.title, stack.read('todos', '1')!.title]
  }

  it('stops at the first plugin that answers, so a later one cannot overwrite the result', async () => {
    const stack = await stackWith(
      ({ setResult }) => setResult({ id: '1', title: 'First' }),
      ({ setResult }) => setResult({ id: '1', title: 'Second' }),
    )

    expect(await titles(stack)).toEqual(['First', 'First'])
  })

  it('lets a later plugin answer when setResult opts out of aborting', async () => {
    const stack = await stackWith(
      ({ setResult }) => setResult({ id: '1', title: 'First' }, { abort: false }),
      ({ setResult }) => setResult({ id: '1', title: 'Second' }),
    )

    expect(await titles(stack)).toEqual(['Second', 'Second'])
  })

  it('keeps going after setResult(null), so a plugin can decline without ending the chain', async () => {
    const stack = await stackWith(
      ({ setResult }) => setResult(null),
      ({ setResult }) => setResult({ id: '1', title: 'Second' }),
    )

    expect(await titles(stack)).toEqual(['Second', 'Second'])
  })

  it('stops on abort() even when the result was set with abort: false', async () => {
    const stack = await stackWith(
      ({ setResult, abort }) => {
        setResult({ id: '1', title: 'First' }, { abort: false })
        abort()
      },
      ({ setResult }) => setResult({ id: '1', title: 'Second' }),
    )

    expect(await titles(stack)).toEqual(['First', 'First'])
  })
}

describe('createItem: an unusable answer must not reach the cache', () => {
  it('rejects when no plugin answers, and rolls the optimistic layer back', async () => {
    const stack = await setup({ remote: false, plugins: [silent('createItem')] })

    await expect(create(stack, { id: '1', title: 'Nobody answers' }))
      .rejects
      .toThrow('Item creation failed: result is nullish')
    expect(stack.read('todos', '1')).toBeUndefined()
  })

  it('rejects when the answer carries no key, instead of caching a row under `undefined`', async () => {
    const stack = await setup()

    await expect(create(stack, { title: 'No key' }))
      .rejects
      .toThrow('Item creation failed: key is not defined')
    expect(stack.readMany('todos')).toEqual([])
  })

  it('accepts a falsy key like 0 rather than treating it as missing', async () => {
    const stack = await setup()

    const created = await create(stack, { id: 0, title: 'Zero' })

    expect(created.id).toBe(0)
    expect(stack.read('todos', 0)).toMatchObject({ id: 0, title: 'Zero' })
  })
})

describe('createItem: the optimistic layer a read can see', () => {
  it('shows the item while the request is in flight, then the server row', async () => {
    const stack = await setup()
    stack.remote.respondNext('createItem', item => ({ ...item, reviewed: true }))
    const release = stack.remote.holdNext('createItem')

    const promise = create(stack, { id: '1', title: 'Optimistic' })
    await vi.waitFor(() => expect(stack.remote.callCount('createItem')).toBe(1))

    // `create.ts` adds the layer under the key it resolved from the item, so a
    // read finds it before the backend has answered at all.
    expect(stack.read('todos', '1')).toMatchObject({ title: 'Optimistic' })
    expect(stack.remote.rows('todos')).toEqual([])

    release()
    await promise
    expect(stack.read('todos', '1')).toMatchObject({ title: 'Optimistic', reviewed: true })
  })

  it('shows the override object rather than the sent item', async () => {
    const stack = await setup()
    const release = stack.remote.holdNext('createItem')

    const promise = create(stack, { id: '1', title: 'Sent' }, { optimistic: { title: 'Override' } })
    await vi.waitFor(() => expect(stack.remote.callCount('createItem')).toBe(1))

    expect(stack.read('todos', '1')!.title).toBe('Override')

    release()
    await promise
    expect(stack.read('todos', '1')!.title).toBe('Sent')
  })

  it('layers the item as the caller wrote it, not as it goes on the wire', async () => {
    const stack = await setup({ schema: serializingSchema })
    const release = stack.remote.holdNext('createItem')

    const promise = create(stack, { id: '1', tags: ['a', 'b'] })
    await vi.waitFor(() => expect(stack.remote.callCount('createItem')).toBe(1))

    // The layer is built from `originalItem`, so the optimistic read keeps the
    // parsed shape while the request carries the serialized one.
    expect(stack.read('todos', '1')!.tags).toEqual(['a', 'b'])
    expect(stack.remote.lastRequest('createItem')!.item).toEqual({ id: '1', tags: 'a,b' })

    release()
    await promise
  })

  it('rolls the layer back on failure, leaving nothing cached', async () => {
    const stack = await setup()
    const failure = new Error('backend refused')
    stack.remote.failNext('createItem', failure)

    const caught = await create(stack, { id: '1', title: 'Doomed' }).catch((error: unknown) => error)

    expect(caught).toBe(failure)
    expect(stack.read('todos', '1')).toBeUndefined()
  })

  it('reports the fake remote default failure exactly and rolls its layer back', async () => {
    const stack = await setup()
    stack.remote.failNext('createItem')

    await expect(create(stack, { id: '1', title: 'Doomed' }))
      .rejects
      .toThrow('fake-remote: createItem failed')
    expect(stack.read('todos', '1')).toBeUndefined()
  })

  it('adds no layer with skipCache, so nothing is visible before or after the answer', async () => {
    const stack = await setup()
    const release = stack.remote.holdNext('createItem')

    const promise = create(stack, { id: '1', title: 'Uncached' }, { skipCache: true })
    await vi.waitFor(() => expect(stack.remote.callCount('createItem')).toBe(1))

    expect(stack.read('todos', '1')).toBeUndefined()

    release()
    await promise
    expect(stack.read('todos', '1')).toBeUndefined()
    expect(stack.remote.rows('todos')).toEqual([{ id: '1', title: 'Uncached' }])
  })
})

describe('createItem: what leaves the store', () => {
  it('strips special props and serializes before any plugin sees the payload', async () => {
    const stack = await setup({ schema: serializingSchema })

    await create(stack, { id: '1', tags: ['a', 'b'], $custom: { dirty: true }, _$custom: 'x' })

    expect(stack.remote.lastRequest('createItem')!.item).toEqual({ id: '1', tags: 'a,b' })
  })
})

describe('createItem: plugin result arbitration', () => {
  describeArbitration('createItem', stack => create(stack, { id: '1', title: 'Input' }))
})
