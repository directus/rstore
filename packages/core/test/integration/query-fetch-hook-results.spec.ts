import type { CoreStack } from '#test-utils/store/coreStack'
import type { Plugin } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { findFirst, findMany, getMarker } from '@rstore/core'
import { describe, expect, it } from 'vitest'

/** Core store with one `todos` collection on the fake backend. */
function setup(
  data: Record<string, Array<Record<string, any>>> = { todos: [{ id: '42', name: 'Fetched' }] },
  plugins: Plugin[] = [],
) {
  return createCoreStack({ schema: [{ name: 'todos' }], data, plugins })
}

/** The `store` / `collection` pair every `find*` call in this file takes. */
function target(stack: CoreStack) {
  return { store: stack.store, collection: stack.collection('todos') }
}

describe('fetch hook result controls', () => {
  it('uses a fetchMany hook result and marker for the cache write', async () => {
    const stack = await setup({}, [{
      name: 'controlled-fetch-many',
      before: { plugins: ['fake-remote'] },
      setup({ hook }: any) {
        hook('fetchMany', ({ setMarker, setResult }: any) => {
          setMarker('controlled-many')
          setResult([{ id: 'm1', name: 'From hook' }])
        })
      },
    }])

    const response = await findMany({ ...target(stack), findOptions: { fetchPolicy: 'fetch-only' } })

    expect(response.marker).toBe('controlled-many')
    expect(response.result.map(item => item.id)).toEqual(['m1'])
    expect(stack.remote.callCount('fetchMany')).toBe(0)
    expect(stack.readMany('todos', { marker: getMarker('many', 'controlled-many') }).map(item => item.id)).toEqual(['m1'])
  })

  it('uses a fetchFirst hook result and marker for the cache write', async () => {
    const stack = await setup({}, [{
      name: 'controlled-fetch-first',
      before: { plugins: ['fake-remote'] },
      setup({ hook }: any) {
        hook('fetchFirst', ({ setMarker, setResult }: any) => {
          setMarker('controlled-first')
          setResult({ id: 'f1', name: 'From hook' })
        })
      },
    }])

    const response = await findFirst({ ...target(stack), findOptions: { key: 'f1', fetchPolicy: 'fetch-only' } })

    expect(response.marker).toBe('controlled-first')
    expect(response.result?.id).toBe('f1')
    expect(stack.remote.callCount('fetchFirst')).toBe(0)
    expect(stack.readMany('todos', { marker: getMarker('first', 'controlled-first') }).map(item => item.id)).toEqual(['f1'])
  })
})

describe('afterFetch result replacement', () => {
  it('replaces a findMany result and writes replacement to cache', async () => {
    const stack = await setup(undefined, [{
      name: 'replace-after-fetch-many',
      setup({ hook }: any) {
        hook('afterFetch', ({ many, setResult }: any) => {
          if (many) {
            setResult([{ id: 'many-replacement', name: 'After fetch' }])
          }
        })
      },
    }])

    const response = await findMany({ ...target(stack), findOptions: { fetchPolicy: 'fetch-only' } })

    expect(response.result).toMatchObject([{ id: 'many-replacement', name: 'After fetch' }])
    expect(stack.read('todos', 'many-replacement')).toMatchObject({ name: 'After fetch' })
    expect(stack.read('todos', '42')).toBeUndefined()
  })

  it('replaces a findFirst result and writes replacement to cache', async () => {
    const stack = await setup(undefined, [{
      name: 'replace-after-fetch-first',
      setup({ hook }: any) {
        hook('afterFetch', ({ many, setResult }: any) => {
          if (!many) {
            setResult({ id: 'first-replacement', name: 'After fetch' })
          }
        })
      },
    }])

    const response = await findFirst({ ...target(stack), findOptions: { key: '42', fetchPolicy: 'fetch-only' } })

    expect(response.result).toMatchObject({ id: 'first-replacement', name: 'After fetch' })
    expect(stack.read('todos', 'first-replacement')).toMatchObject({ name: 'After fetch' })
    expect(stack.read('todos', '42')).toBeUndefined()
  })
})
