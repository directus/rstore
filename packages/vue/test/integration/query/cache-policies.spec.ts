import { afterEach, describe, expect, it, vi } from 'vitest'
import { setup } from '../../utils/query'

describe('query', () => {
  afterEach(() => {
    // The stacks stop their own effect scopes; the globals are ours to restore.
    vi.unstubAllGlobals()
  })

  describe('cache-first', () => {
    describe('fetchFirst', () => {
      it('should load item from network if not in cache', async () => {
        const { store, run } = await setup([
          {
            name: 'messages',
            hooks: {
              fetchFirst: () => {
                return { id: 'foo', text: 'from network' }
              },
            },
          },
        ])

        const query = await run(() => store.messages.query((q: any) => q.first({
          key: 'foo',
          fetchPolicy: 'cache-first',
        })))

        expect(query.data.value?.text).toBe('from network')
      })

      it('should load item from cache if present', async () => {
        const { store, run } = await setup([
          {
            name: 'messages',
            hooks: {
              fetchFirst: () => {
                return { id: 'foo', text: 'from network' }
              },
            },
          },
        ])

        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'foo',
          item: { id: 'foo', text: 'from cache' },
        })

        const query = await run(() => store.messages.query((q: any) => q.first({
          key: 'foo',
          fetchPolicy: 'cache-first',
        })))

        expect(query.data.value?.text).toBe('from cache')
      })
    })

    describe('fetchMany', () => {
      it('should load items from network if not in cache', async () => {
        const { store, run } = await setup([
          {
            name: 'messages',
            hooks: {
              fetchMany: () => {
                return [
                  { id: 'foo', text: 'from network' },
                  { id: 'bar', text: 'from network' },
                ]
              },
            },
          },
        ])

        const query = await run(() => store.messages.query((q: any) => q.many({
          fetchPolicy: 'cache-first',
        })))

        expect(query.data.value?.length).toBe(2)
        expect(query.data.value?.[0]?.text).toBe('from network')
        expect(query.data.value?.[1]?.text).toBe('from network')
      })

      it('should load items from cache if present', async () => {
        const { store, run } = await setup([
          {
            name: 'messages',
            hooks: {
              fetchMany: () => {
                return [
                  { id: 'foo', text: 'from network' },
                  { id: 'bar', text: 'from network' },
                ]
              },
            },
          },
        ])

        // Mark the query as cached
        await store.messages.findMany({
          fetchPolicy: 'cache-first',
        })

        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'foo',
          item: { id: 'foo', text: 'from cache' },
        })
        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'bar',
          item: { id: 'bar', text: 'from cache' },
        })
        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'baz',
          item: { id: 'baz', text: 'from cache' },
        })

        const query = await run(() => store.messages.query((q: any) => q.many({
          fetchPolicy: 'cache-first',
        })))

        expect(query.data.value?.length).toBe(3)
        expect(query.data.value?.[0]?.text).toBe('from cache')
        expect(query.data.value?.[1]?.text).toBe('from cache')
        expect(query.data.value?.[2]?.text).toBe('from cache')
      })
    })
  })

  describe('no-cache', () => {
    describe('fetchFirst', () => {
      it('should read from network with no cache', async () => {
        const { store, run } = await setup([
          {
            name: 'messages',
            hooks: {
              fetchFirst: () => {
                return { id: 'foo', text: 'from network' }
              },
            },
          },
        ])

        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'foo',
          item: { id: 'foo', text: 'cached' },
        })

        const query = await run(() => store.messages.query((q: any) => q.first({
          key: 'foo',
          fetchPolicy: 'no-cache',
        })))

        expect(query.data.value?.text).toBe('from network')
      })
    })

    describe('fetchMany', () => {
      it('should read from network with no cache', async () => {
        const { store, run } = await setup([
          {
            name: 'messages',
            hooks: {
              fetchMany: () => {
                return [
                  { id: 'foo', text: 'from network' },
                  { id: 'bar', text: 'from network' },
                ]
              },
            },
          },
        ])

        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'foo',
          item: { id: 'foo', text: 'cached' },
        })
        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'bar',
          item: { id: 'bar', text: 'cached' },
        })

        const query = await run(() => store.messages.query((q: any) => q.many({
          fetchPolicy: 'no-cache',
        })))

        expect(query.data.value?.length).toBe(2)
        expect(query.data.value?.[0]?.text).toBe('from network')
        expect(query.data.value?.[1]?.text).toBe('from network')

        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'foo',
          item: { id: 'foo', text: 'cached' },
        })
        store.$cache.writeItem({
          collection: store.$collections[0]!,
          key: 'bar',
          item: { id: 'bar', text: 'cached' },
        })

        expect(query.data.value?.length).toBe(2)
        expect(query.data.value?.[0]?.text).toBe('from network')
        expect(query.data.value?.[1]?.text).toBe('from network')
      })
    })
  })
})
