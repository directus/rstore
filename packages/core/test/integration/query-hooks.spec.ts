import type { CoreStack } from '#test-utils/store/coreStack'
import type { Plugin } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { trackUnhandledRejections } from '#test-utils/unhandledRejections'
import { findFirst, findMany, getMarker } from '@rstore/core'
import { describe, expect, it } from 'vitest'

// The cache-write half of `find*` used to be asserted as arguments of a
// `vi.fn()` cache — `marker: expect.any(String)` included. A marker's only job
// is to be found again by a later read, and a spy argument cannot notice when
// it stops being findable, which is exactly the `defaultMarker` / `fetchPolicy`
// bug (`packages/core/src/cache.ts:12-18`). Everything here writes through the
// real cache and reads back.

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

describe('findMany cache writes', () => {
  it('writes a marker later reads find again, whatever their fetch policy', async () => {
    const stack = await setup()
    const options = { ...target(stack), findOptions: { fetchPolicy: 'cache-first' as const } }

    const first = await findMany(options)
    expect(first.result.map(todo => todo.id)).toEqual(['42'])

    // The marker is proved by being found, not by being a string.
    expect(stack.readMany('todos', { marker: getMarker('many', first.marker!) }))
      .toMatchObject([{ id: '42', name: 'Fetched' }])

    // The same query recomputes the marker and must match the written one.
    await findMany(options)
    expect(stack.remote.callCount('fetchMany')).toBe(1)

    // So must a different fetch policy: `defaultMarker` excludes `fetchPolicy`,
    // and a marker that embeds it makes every policy mint its own.
    const cacheOnly = await findMany({ ...target(stack), findOptions: { fetchPolicy: 'cache-only' } })
    expect(cacheOnly.result.map(todo => todo.id)).toEqual(['42'])
    expect(stack.remote.callCount('fetchMany')).toBe(1)
  })

  it('returns the cache first and writes behind fetchPromise on cache-and-fetch', async () => {
    const stack = await setup()

    const result = await findMany({ ...target(stack), findOptions: { fetchPolicy: 'cache-and-fetch' } })

    expect(result.result).toEqual([])
    expect(stack.readMany('todos')).toEqual([])

    await result.fetchPromise

    expect(stack.readMany('todos', { marker: getMarker('many', result.marker!) }))
      .toMatchObject([{ id: '42', name: 'Fetched' }])
  })

  it('does not emit an unhandled rejection when the cache-and-fetch background fetch fails', async () => {
    const stack = await setup()
    stack.remote.failNext('fetchMany', new Error('Fetch failed'))

    const rejections = trackUnhandledRejections()
    try {
      // The caller deliberately ignores `fetchPromise` here
      const result = await findMany({ ...target(stack), findOptions: { fetchPolicy: 'cache-and-fetch' } })

      expect(await rejections.flush()).toEqual([])

      // The failure is still observable by callers that await the promise
      await expect(result.fetchPromise).rejects.toThrow('Fetch failed')
    }
    finally {
      rejections.stop()
    }
  })

  it('returns the fetched items on no-cache and leaves the cache empty', async () => {
    const stack = await setup()

    const { result } = await findMany({ ...target(stack), findOptions: { fetchPolicy: 'no-cache' } })

    expect(result.map(todo => todo.id)).toEqual(['42'])
    expect(stack.readMany('todos')).toEqual([])
  })

  it('writes an item whose key is `0` instead of treating it as missing', async () => {
    const stack = await setup({ todos: [{ id: 0, name: 'Falsy Key Item' }] })

    await findMany({ ...target(stack), findOptions: { fetchPolicy: 'fetch-only' } })

    expect(stack.read('todos', 0)).toMatchObject({ id: 0, name: 'Falsy Key Item' })
  })

  it('dispatches fetchMany with the resolved find options', async () => {
    const stack = await setup()

    await findMany({ ...target(stack), findOptions: { params: { email: '42' } } })

    expect(stack.remote.lastRequest('fetchMany')!.findOptions).toMatchObject({
      params: { email: '42' },
      fetchPolicy: 'cache-first',
      resultMode: 'computed',
    })
  })
})

describe('findFirst cache writes', () => {
  it('writes a marker a later filter read finds, whatever its fetch policy', async () => {
    const stack = await setup()
    const byName = (todo: any) => todo.name === 'Fetched'

    // A key-based read answers from `readItem` and never looks at a marker, so
    // the marker of `findFirst` is only observable through a filter read.
    const first = await findFirst({ ...target(stack), findOptions: { filter: byName, fetchPolicy: 'cache-first' } })
    expect(first.result?.id).toBe('42')
    expect(stack.readMany('todos', { marker: getMarker('first', first.marker!) }))
      .toMatchObject([{ id: '42', name: 'Fetched' }])

    const cacheOnly = await findFirst({ ...target(stack), findOptions: { filter: byName, fetchPolicy: 'cache-only' } })
    expect(cacheOnly.result?.id).toBe('42')
    expect(stack.remote.callCount('fetchFirst')).toBe(1)
  })

  it('returns null first and writes behind fetchPromise on cache-and-fetch', async () => {
    const stack = await setup()

    const result = await findFirst({ ...target(stack), findOptions: { key: '42', fetchPolicy: 'cache-and-fetch' } })

    expect(result.result).toBeNull()
    expect(stack.read('todos', '42')).toBeUndefined()

    await result.fetchPromise

    expect(stack.read('todos', '42')).toMatchObject({ id: '42', name: 'Fetched' })
  })

  it('does not emit an unhandled rejection when the cache-and-fetch background fetch fails', async () => {
    const stack = await setup()
    stack.remote.failNext('fetchFirst', new Error('Fetch failed'))

    const rejections = trackUnhandledRejections()
    try {
      // The caller deliberately ignores `fetchPromise` here
      const result = await findFirst({ ...target(stack), findOptions: { key: '42', fetchPolicy: 'cache-and-fetch' } })

      expect(await rejections.flush()).toEqual([])

      // The failure is still observable by callers that await the promise
      await expect(result.fetchPromise).rejects.toThrow('Fetch failed')
    }
    finally {
      rejections.stop()
    }
  })

  it('hands back an item detached from the cache on no-cache', async () => {
    const stack = await setup()

    const detached = (await findFirst({ ...target(stack), findOptions: { key: '42', fetchPolicy: 'no-cache' } })).result!

    expect(detached.name).toBe('Fetched')
    expect(stack.read('todos', '42')).toBeUndefined()

    // `noCache` wraps the raw item rather than the cache entry, so a later
    // write to that key must not be visible through it.
    stack.remote.seed('todos', [{ id: '42', name: 'Renamed' }])
    await findFirst({ ...target(stack), findOptions: { key: '42', fetchPolicy: 'fetch-only' } })

    expect(stack.read('todos', '42')!.name).toBe('Renamed')
    expect(detached.name).toBe('Fetched')
  })

  it('writes an item whose key is `0` instead of treating it as missing', async () => {
    const stack = await setup({ todos: [{ id: 0, name: 'Falsy Key Item' }] })

    await findFirst({ ...target(stack), findOptions: { key: 0, fetchPolicy: 'fetch-only' } })

    expect(stack.read('todos', 0)).toMatchObject({ id: 0, name: 'Falsy Key Item' })
  })

  it('dispatches fetchFirst with the key and the resolved find options', async () => {
    const stack = await setup()

    await findFirst({ ...target(stack), findOptions: '42' })

    const request = stack.remote.lastRequest('fetchFirst')!
    expect(request.key).toBe('42')
    expect(request.findOptions).toMatchObject({
      key: '42',
      fetchPolicy: 'cache-first',
      resultMode: 'computed',
    })
  })
})

describe('fetchRelations hook dispatch', () => {
  it('passes the fetched first item and include options to fetchRelations', async () => {
    const seen: any[] = []
    const stack = await setup(undefined, [{
      name: 'relation-observer',
      before: { plugins: ['fake-remote'] },
      setup({ hook }: any) {
        hook('fetchRelations', (payload: any) => {
          seen.push({
            many: payload.many,
            key: payload.key,
            include: payload.findOptions.include,
            result: payload.getResult(),
          })
          payload.abort()
        })
      },
    }])

    await findFirst({ ...target(stack), findOptions: { key: '42', include: { owner: true } } as any })

    expect(seen).toEqual([{
      many: false,
      key: '42',
      include: { owner: true },
      result: { id: '42', name: 'Fetched' },
    }])
  })

  it('passes all fetched items to fetchRelations and skips cache-only reads', async () => {
    const seen: any[] = []
    const stack = await setup(undefined, [{
      name: 'relation-observer',
      before: { plugins: ['fake-remote'] },
      setup({ hook }: any) {
        hook('fetchRelations', (payload: any) => {
          seen.push({
            many: payload.many,
            include: payload.findOptions.include,
            result: payload.getResult(),
          })
          payload.abort()
        })
      },
    }])

    await findMany({ ...target(stack), findOptions: { include: { owner: true } } as any })
    await findMany({ ...target(stack), findOptions: { include: { owner: true }, fetchPolicy: 'cache-only' } as any })

    expect(seen).toEqual([{
      many: true,
      include: { owner: true },
      result: [{ id: '42', name: 'Fetched' }],
    }])
  })
})
