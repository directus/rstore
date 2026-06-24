import { withItemType } from '@rstore/core'
import { describe, expect, it, vi } from 'vitest'
import { createStore } from '../src/store'

describe('mutate', () => {
  it('should run a custom mutation through the collection API', async () => {
    const Users = withItemType<{
      id: number
      name: string
    }>().defineCollection({
      name: 'users',
    })

    const store = await createStore({
      schema: [Users],
      plugins: [],
    })
    const afterMutation = vi.fn()
    store.$hooks.hook('afterMutation', afterMutation)

    const result = await store.users.mutate({
      mutation: 'create',
    }, () => ({ id: 1, name: 'Ada' }))

    expect(result).toEqual({ id: 1, name: 'Ada' })
    expect(afterMutation).toHaveBeenCalledWith(expect.objectContaining({
      collection: store.$collections[0],
      mutation: 'create',
      getResult: expect.any(Function),
      setResult: expect.any(Function),
    }))
    expect(store.users.peekFirst(1)).toEqual({ id: 1, name: 'Ada' })
  })

  it('should allow union collection variables', async () => {
    const Users = withItemType<{
      id: number
      name: string
    }>().defineCollection({
      name: 'users',
    })
    const Teams = withItemType<{
      id: number
      title: string
    }>().defineCollection({
      name: 'teams',
    })

    const _store = await createStore({
      schema: [Users, Teams],
      plugins: [],
    })

    type CollectionApi = typeof _store.users | typeof _store.teams
    type Item = NonNullable<Awaited<ReturnType<CollectionApi['findFirst']>>>

    function saveFromUnion(collection: CollectionApi, item: Item) {
      return collection.mutate({ mutation: 'create' }, async () => item)
    }

    expect(saveFromUnion).toBeTypeOf('function')
  })
})
