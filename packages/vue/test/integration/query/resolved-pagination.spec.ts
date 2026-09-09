import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'

describe('computed pagination with resolved options', () => {
  it.each(['explicit', 'default', 'hook'] as const)('uses pageSize supplied by %s', async (source) => {
    const stack = await createVueStack({
      schema: [{ name: 'items' }],
      data: { items: [{ id: '1' }, { id: '2' }, { id: '3' }] },
      findDefaults: source === 'default' ? { pageSize: 1 } : undefined,
      plugins: source === 'hook'
        ? [{
            name: 'page-size',
            setup({ hook }) {
              hook('resolveFindOptions', ({ updateFindOptions }: any) => updateFindOptions({ pageSize: 1 }))
            },
          }]
        : [],
    })
    const query = await stack.run(() => stack.store.items.query((q: any) => q.many({
      fetchPolicy: 'fetch-only',
      resultMode: 'computed',
      pageIndex: 0,
      ...(source === 'explicit' ? { pageSize: 1 } : {}),
    })))
    expect(query.pages.value[0].data.map((item: any) => item.id)).toEqual(['1'])
    await query.fetchMore({ pageIndex: 1 })
    expect(query.pages.value.map((page: any) => page.data.map((item: any) => item.id))).toEqual([['1'], ['2']])
    await query.fetchMore({ pageIndex: 2 })
    expect(query.pages.value.map((page: any) => page.data.map((item: any) => item.id))).toEqual([['1'], ['2'], ['3']])
    expect(stack.remote.requests('fetchMany').map(request => request.findOptions.pageSize)).toEqual([1, 1, 1])
  })
})
