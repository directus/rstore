import { createCoreStack } from '#test-utils/store/coreStack'
import { findMany } from '@rstore/core'
import { describe, expect, it } from 'vitest'

describe('find defaults', () => {
  it('merges store defaults with call options before remote dispatch', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'messages' }],
      data: { messages: [{ id: '1' }] },
      findDefaults: {
        pageSize: 25,
        fetchPolicy: 'fetch-only',
        resultMode: 'responseRefs',
        fetchOptions: { autoRefresh: 'windowFocus' },
      },
    })

    await findMany({
      store: stack.store,
      collection: stack.collection('messages'),
      findOptions: {
        fetchPolicy: 'cache-and-fetch',
        fetchOptions: { autoRefresh: 'manual' },
      },
    })

    expect(stack.remote.lastRequest('fetchMany')?.findOptions).toMatchObject({
      pageSize: 25,
      fetchPolicy: 'cache-and-fetch',
      resultMode: 'responseRefs',
      fetchOptions: { autoRefresh: 'manual' },
    })
  })

  it('applies resolveFindOptions hook changes to public queries', async () => {
    const stack = await createCoreStack({
      schema: [{ name: 'messages' }],
      data: { messages: [{ id: '1' }] },
      plugins: [{
        name: 'query-policy',
        setup({ hook }: any) {
          hook('resolveFindOptions', ({ updateFindOptions }: any) => {
            updateFindOptions({ fetchPolicy: 'fetch-only', params: { tenant: 'alpha' } })
          })
        },
      }],
    })

    await findMany({
      store: stack.store,
      collection: stack.collection('messages'),
      findOptions: { fetchPolicy: 'cache-only' },
    })

    expect(stack.remote.lastRequest('fetchMany')?.findOptions).toMatchObject({
      fetchPolicy: 'fetch-only',
      params: { tenant: 'alpha' },
    })
  })
})
