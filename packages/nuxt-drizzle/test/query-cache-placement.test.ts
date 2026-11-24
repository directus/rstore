import { definePlugin } from '@rstore/vue'
import { describe, expect, it, vi } from 'vitest'
import { createVueStack } from '../../../test/utils/store/vueStack'
import { installQueryCacheHooks } from '../src/runtime/plugin/queryCacheHooks'
import { eq } from '../src/runtime/utils/where'

describe('nuxt-Drizzle exact-page create placement', () => {
  it.each([true, false])('uses a provable sort position only with server approval (%s)', async (approved) => {
    const stack = await createVueStack({
      schema: [{ name: 'todos' }],
      data: { todos: [] },
      plugins: [definePlugin({
        name: 'sqlite-create-placement',
        setup({ hook }) {
          installQueryCacheHooks({ dialect: 'sqlite' }, hook)
          hook('fetchMany', ({ setResult, meta }) => {
            Object.assign(meta, { drizzleLocalCreatePlacement: approved })
            setResult([{ id: 'a', project: 1, rank: 10 }, { id: 'c', project: 1, rank: 30 }])
          })
        },
      })],
    })
    const query = await stack.run(() => stack.store.todos.query((q: any) => q.many({
      resultMode: 'responseRefs',
      localMembership: 'auto',
      where: eq('project', 1),
      params: { orderBy: ['rank.asc', 'id.asc'] },
      pageSize: 2,
      pageIndex: 0,
    })))
    const release = stack.remote.holdNext('createItem')
    const created = stack.store.todos.create({ id: 'b', project: 1, rank: 20 })
    try {
      await vi.waitFor(() => expect(stack.remote.callCount('createItem')).toBe(1))
      expect(query.data.value.map((row: { id: string }) => row.id)).toEqual(approved ? ['a', 'b', 'c'] : ['a', 'c'])
    }
    finally {
      release()
      await created
    }
  })
})
