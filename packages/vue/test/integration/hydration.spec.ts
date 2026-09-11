import type { CacheModuleSnapshot, StoreSchema } from '@rstore/shared'
import { hydrate } from '#test-utils/store/ssr'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it, vi } from 'vitest'
import { isProxy, nextTick, toRaw } from 'vue'
import { defineModule, realtimeReconnectEventHook } from '../../src'

// `getState()` / `setState()` is the whole contract between server rendering
// and the client (`packages/nuxt/src/runtime/plugin.ts:42`), and outside the
// three minute-scale `nuxt-boot` boots nothing crosses it. These tests render
// on a server store, ship the payload through `structuredClone`, and assert
// what the client sees.

/** Blog-shaped schema with a relation, an index and a computed property. */
const schema: StoreSchema = [
  {
    name: 'authors',
    relations: {
      posts: { many: true, to: { posts: { on: { author_id: 'id' } } } },
    },
    computed: {
      handle: (author: any) => `@${author.name}`,
    },
  },
  {
    name: 'posts',
    relations: {
      author: { to: { authors: { on: { id: 'author_id' } } } },
    },
  },
]

/** Rows both stores start from, so only the payload can explain a difference. */
function rows() {
  return {
    authors: [
      { id: 'a1', name: 'Ada' },
      { id: 'a2', name: 'Alan' },
    ],
    posts: [
      { id: 'p1', title: 'First', author_id: 'a1' },
      { id: 'p2', title: 'Second', author_id: 'a1' },
      { id: 'p3', title: 'Third', author_id: 'a2' },
    ],
  }
}

/**
 * Creates one side of the SSR boundary.
 *
 * @param isServer Whether the store renders on the server.
 * @param data Backend rows the store's remote answers with.
 */
function createSide(isServer: boolean, data: Record<string, Array<Record<string, any>>> = rows()) {
  return createVueStack({ schema, data, isServer })
}

/** Server store, its rendered payload, and a fresh client store to hydrate. */
async function renderAndHydrate(render: (store: any, run: any) => Promise<unknown>) {
  const server = await createSide(true)
  await render(server.store, server.run)
  const payload = server.store.$cache.getState()

  const client = await createSide(false)
  hydrate(client.store.$cache, payload)
  return { server, client, payload }
}

describe('ssr hydration round trip', () => {
  it.each([0, 1, '1', '01'])('updates hydrated relation membership for key %j', async (key) => {
    const server = await createSide(true, { authors: rows().authors, posts: [{ id: key, author_id: 'a1' }] })
    await server.store.authors.findMany({ include: { posts: true } })
    const client = await createSide(false)
    hydrate(client.cache, server.cache.getState())
    const first = client.store.authors.peekFirst('a1')
    const second = client.store.authors.peekFirst('a2')
    expect(first.posts.map((post: any) => post.id)).toEqual([key])

    client.store.posts.writeItem({ id: key, author_id: 'a2' })
    expect(first.posts).toEqual([])
    expect(second.posts.map((post: any) => post.id)).toEqual([key])
    client.store.posts.writeItem({ id: key, author_id: 'a1' })
    expect(first.posts.map((post: any) => post.id)).toEqual([key])
    expect(second.posts).toEqual([])
  })

  it('answers a cache-first query from the payload without a request', async () => {
    const { client } = await renderAndHydrate(async (store, run) => {
      await run(() => store.posts.query((q: any) => q.many()))
    })

    const query = await client.run(() => client.store.posts.query((q: any) => q.many()))

    expect(query.data.value.map((post: any) => post.title)).toEqual(['First', 'Second', 'Third'])
    expect(client.remote.callCount('fetchMany', 'posts')).toBe(0)
  })

  it('matches the marker of a query carrying a filter function across the boundary', async () => {
    // Regression for `384b3ba`: markers embedded a per-process function id, so
    // every function-bearing query refetched on hydration. The two `filter`
    // functions below are deliberately distinct instances.
    const { client } = await renderAndHydrate(async (store, run) => {
      await run(() => store.posts.query((q: any) => q.many({
        filter: (post: any) => post.author_id === 'a1',
      })))
    })

    const query = await client.run(() => client.store.posts.query((q: any) => q.many({
      filter: (post: any) => post.author_id === 'a1',
    })))

    expect(query.data.value.map((post: any) => post.id)).toEqual(['p1', 'p2'])
    expect(client.remote.callCount('fetchMany', 'posts')).toBe(0)
  })

  it('rehydrates items as wrapped items with relations, keys and computed props', async () => {
    const { client } = await renderAndHydrate(async (store) => {
      await store.authors.findMany({ include: { posts: true } })
    })

    const author = client.store.authors.peekFirst('a1')

    expect(author.$getKey()).toBe('a1')
    expect(author.handle).toBe('@Ada')
    expect(author.posts.map((post: any) => post.id)).toEqual(['p1', 'p2'])
    expect(client.remote.callCount('fetchMany')).toBe(0)
  })

  it('hydrates detached module state through a structured-clone transport', async () => {
    const useSession = defineModule('session', ({ defineState }: any) => {
      const state = defineState({
        nested: {
          updatedAt: new Date('2026-09-04T10:00:00.000Z'),
          labels: new Map([['owner', 'Ada']]),
        },
      }, 'main')
      return { state }
    })

    const server = await createSide(true)
    const serverModule: any = await useSession(server.store as any)
    const snapshot = server.store.$cache.getState()
    const moduleSnapshot = snapshot.modules.find((module: CacheModuleSnapshot) => 'name' in module && module.name === 'session' && module.key === 'main')!.state as any
    const payload = structuredClone(snapshot)
    const modulePayload = payload.modules.find((module: CacheModuleSnapshot) => 'name' in module && module.name === 'session' && module.key === 'main')!.state as any

    // The cache returns raw module state. Transport owns detachment, preserving
    // Date and Map while ensuring neither side can mutate the other.
    expect(isProxy(moduleSnapshot)).toBe(false)
    expect(modulePayload).not.toBe(toRaw(serverModule.state))
    expect(isProxy(modulePayload)).toBe(false)
    expect(modulePayload.nested.updatedAt).toBeInstanceOf(Date)
    expect(modulePayload.nested.labels).toBeInstanceOf(Map)
    expect(modulePayload.nested.labels.get('owner')).toBe('Ada')

    const client = await createSide(false)
    hydrate(client.store.$cache, payload)
    const clientModule: any = await useSession(client.store as any)

    expect(isProxy(clientModule.state)).toBe(true)
    expect(toRaw(clientModule.state)).not.toBe(toRaw(serverModule.state))
    expect(clientModule.state.nested.updatedAt).toBeInstanceOf(Date)
    expect(clientModule.state.nested.labels).toBeInstanceOf(Map)
    expect(clientModule.state.nested.labels.get('owner')).toBe('Ada')
  })

  it('round-trips module tuples whose joined legacy keys collide', async () => {
    const useFirst = defineModule('a:b', ({ defineState }: any) => ({
      state: defineState({ value: 'first' }, 'c'),
    }))
    const useSecond = defineModule('a', ({ defineState }: any) => ({
      state: defineState({ value: 'second' }, 'b:c'),
    }))
    const server = await createSide(true)
    await useFirst(server.store as any)
    await useSecond(server.store as any)

    const payload = structuredClone(server.store.$cache.getState())
    expect(payload.modules).toEqual(expect.arrayContaining([
      { name: 'a:b', key: 'c', state: { value: 'first' } },
      { name: 'a', key: 'b:c', state: { value: 'second' } },
    ]))

    const client = await createSide(false)
    hydrate(client.store.$cache, payload)
    const first: any = await useFirst(client.store as any)
    const second: any = await useSecond(client.store as any)

    expect(first.state.value).toBe('first')
    expect(second.state.value).toBe('second')
  })

  it('hydrates page 0 of a paginated query without refetching and fetches page 1', async () => {
    const { client } = await renderAndHydrate(async (store, run) => {
      await run(() => store.posts.query((q: any) => q.many({ pageSize: 2 })))
    })

    const query = await client.run(() => client.store.posts.query((q: any) => q.many({ pageSize: 2 })))

    expect(query.mainPage.data.map((post: any) => post.id)).toEqual(['p1', 'p2'])
    expect(client.remote.callCount('fetchMany', 'posts')).toBe(0)

    const { page } = await query.fetchMore({ pageIndex: 1 })

    expect(page.data.map((post: any) => post.id)).toEqual(['p3'])
    expect(client.remote.callCount('fetchMany', 'posts')).toBe(1)
  })

  it('replaces the page refs of a query that ran before hydration', async () => {
    // `setStateNow` clears `pageRefs`. Without that, the page of a query the
    // client ran before the payload landed keeps pointing at keys the payload
    // replaced, and the query renders nothing.
    const client = await createSide(false, {
      posts: [{ id: 'stale', title: 'Stale', author_id: 'a1' }],
    })
    await client.run(() => client.store.posts.query((q: any) => q.many({ resultMode: 'responseRefs' })))

    const server = await createSide(true)
    await server.run(() => server.store.posts.query((q: any) => q.many({ resultMode: 'responseRefs' })))
    hydrate(client.store.$cache, server.store.$cache.getState())

    const query = await client.run(() => client.store.posts.query((q: any) => q.many({ resultMode: 'responseRefs' })))

    expect(query.data.value.map((post: any) => post.id)).toEqual(['p1', 'p2', 'p3'])
  })

  it('opens no subscription and no reconnect listener on the server store', async () => {
    const server = await createSide(true)

    const query = await server.run(() => server.store.posts.liveQuery((q: any) => q.many()))
    await nextTick()

    // `api/query.ts:60` returns a no-op subscription on the server; a real one
    // would leak the query graph for the lifetime of the process.
    expect(server.remote.subscriptions()).toEqual([])
    expect(server.remote.callCount('subscribe')).toBe(0)

    const before = server.remote.callCount('fetchMany', 'posts')
    await realtimeReconnectEventHook.trigger(undefined)
    await vi.waitFor(() => expect(query.loading.value).toBe(false))

    expect(server.remote.callCount('fetchMany', 'posts')).toBe(before)
  })
})

describe('causality across hydration', () => {
  it.each([0, 1, '1', '01', 'p1'])('preserves causal ordering after hydration for key %j', async (key) => {
    const server = await createSide(true)
    const collection = server.store.$collections.find((c: any) => c.name === 'posts')!
    await server.store.posts.findMany()
    // A CRDT collection: the server holds a value stamped at 200 and the
    // tombstone of an item deleted at 300.
    server.store.$cache.writeItem({
      collection,
      key,
      item: { id: key, title: 'Server title', author_id: 'a1' },
      fieldTimestamps: { title: 200 },
    })
    server.store.$cache.deleteItem({ collection, key: 'p3', deletedAt: 300 })

    const client = await createSide(false)
    hydrate(client.store.$cache, server.store.$cache.getState())
    const clientCollection = client.store.$collections.find((c: any) => c.name === 'posts')!

    // Both writes are causally older than what the server already knew, so
    // both must be dropped. With no timestamps and no tombstones in the
    // payload they win instead, silently losing the server's state.
    client.store.$cache.writeItem({
      collection: clientCollection,
      key,
      item: { id: key, title: 'Stale title' },
      fieldTimestamps: { title: 100 },
    })
    client.store.$cache.writeItem({
      collection: clientCollection,
      key: 'p3',
      item: { id: 'p3', title: 'Resurrected', author_id: 'a2' },
      fieldTimestamps: { title: 100 },
    })
    await nextTick()

    expect(client.store.posts.peekFirst(key).title).toBe('Server title')
    expect(client.store.$cache.readFieldTimestamps({ collectionName: 'posts', key })).toMatchObject({ title: 200 })
    expect(client.store.posts.peekFirst('p3')).toBeFalsy()
  })

  it('does not retain stale relation matches after hydration', async () => {
    const client = await createSide(false, {
      authors: [{ id: 'a1', name: 'Ada' }, { id: 'a2', name: 'Alan' }],
      posts: [{ id: 'p1', title: 'First', author_id: 'a1' }],
    })
    await client.store.authors.findMany()
    await client.store.posts.findMany()

    // The server moved `p1` to another author, so a1 owns nothing any more.
    const server = await createSide(true, {
      authors: [{ id: 'a1', name: 'Ada' }, { id: 'a2', name: 'Alan' }],
      posts: [{ id: 'p1', title: 'First', author_id: 'a2' }],
    })
    await server.store.authors.findMany()
    await server.store.posts.findMany()
    hydrate(client.store.$cache, server.store.$cache.getState())

    expect(client.store.authors.peekFirst('a1').posts).toEqual([])
  })
})
