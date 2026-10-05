import { describe, expect, it, vi } from 'vitest'
import { useQueryTracking } from '../../../src'
import { cached, createGarbageCollectionStack, drainGarbageCollection, todoSchema } from './utils'

/** Raw key pairs whose cache identities must remain shared or distinct. */
const keyCases: Array<[string | number, string | number, boolean]> = [
  [1, '1', true],
  ['1', 1, true],
  [Number.NaN, 'NaN', true],
  ['NaN', Number.NaN, true],
  [Infinity, 'Infinity', true],
  ['Infinity', Infinity, true],
  [-Infinity, '-Infinity', true],
  ['-Infinity', -Infinity, true],
  [-0, '0', true],
  ['0', -0, true],
  [1e21, '1e+21', true],
  ['1e+21', 1e21, true],
  ['01', '01', true],
  ['01', 1, false],
  ['1.0', 1, false],
  ['1e21', 1e21, false],
  [' 1', 1, false],
  ['', 0, false],
  ['-0', 0, false],
  ['NaN ', Number.NaN, false],
  ['1', 2, false],
]

describe('page ownership membership', () => {
  it.each(keyCases)('reconciles %s with %s using cache identity (retained: %s)', async (previousKey, nextKey, retained) => {
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: [{ id: String(previousKey) }] },
    })
    await stack.store.todos.findMany({ fetchPolicy: 'fetch-only' })
    const ownership = stack.run(() => useQueryTracking({ store: stack.store, cached: [] }))
    ownership.setEnabled(true)
    ownership.handleQueryTracking('main', { items: { todos: new Set([previousKey]) } }, [], undefined, true)
    ownership.handleQueryTracking('main', { items: { todos: new Set([nextKey]) } }, [], undefined, true)
    await drainGarbageCollection()

    if (retained) {
      expect(cached(stack, 'todos', previousKey)).toBeDefined()
    }
    else {
      expect(cached(stack, 'todos', previousKey)).toBeUndefined()
    }
    ownership.releaseAll({ collect: false })
  })

  it('does not retain an identity owned only in another collection', async () => {
    const stack = await createGarbageCollectionStack({
      schema: [{ name: 'todos' }, { name: 'other' }],
      data: { todos: [{ id: 1 }], other: [{ id: '1' }] },
    })
    await stack.store.todos.findMany({ fetchPolicy: 'fetch-only' })
    await stack.store.other.findMany({ fetchPolicy: 'fetch-only' })
    const ownership = stack.run(() => useQueryTracking({ store: stack.store, cached: [] }))
    ownership.setEnabled(true)
    ownership.handleQueryTracking('main', { items: { todos: new Set([1]) } }, [], undefined, true)
    ownership.handleQueryTracking('main', { items: { other: new Set(['1']) } }, [], undefined, true)
    await drainGarbageCollection()

    expect(cached(stack, 'todos', 1)).toBeUndefined()
    expect(cached(stack, 'other', '1')).toBeDefined()
    ownership.releaseAll({ collect: false })
  })

  it('replaces an overlapping page without rescanning its entire key set for every member', async () => {
    const ids = Array.from({ length: 128 }, (_, index) => index)
    const stack = await createGarbageCollectionStack({
      schema: todoSchema,
      data: { todos: ids.map(id => ({ id })) },
    })
    await stack.store.todos.findMany({ fetchPolicy: 'fetch-only' })
    const ownership = stack.run(() => useQueryTracking({ store: stack.store, cached: [] }))
    ownership.setEnabled(true)
    ownership.handleQueryTracking('main', { items: { todos: new Set(ids) } }, [], undefined, true)
    const nextKeys = new Set(ids)
    const scans = vi.spyOn(nextKeys, Symbol.iterator)

    ownership.handleQueryTracking('main', { items: { todos: nextKeys } }, [], undefined, true)
    await drainGarbageCollection()

    // A constant number of page-wide passes allows retaining or indexing a page.
    // Per-member membership checks must not start another page-wide traversal.
    expect(scans.mock.calls.length).toBeLessThanOrEqual(3)
    for (const id of ids)
      expect(cached(stack, 'todos', id)).toBeDefined()
    scans.mockRestore()
    ownership.releaseAll({ collect: false })
  })
})
