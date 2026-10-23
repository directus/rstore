import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { setupLiveTodos } from '../../utils/live-query'

// Real live query and cache metadata; the fake remote labels each response
// with the options it answered.
describe('live query metadata', () => {
  it('keeps the cached metadata of earlier options when options change', async () => {
    const { store, run, remote } = await setupLiveTodos({
      on: { fetchMany: (ctx: any) => {
        ctx.payload.meta.label = ctx.payload.findOptions.params.where.title
        return ctx.next()
      } },
    })
    const options = (title: string) => ({ fetchPolicy: 'cache-first', resultMode: 'responseRefs', params: { where: { title } } })
    await run(() => store.todos.query((q: any) => q.many(options('One'))))
    // The cache-first hit reuses the cached metadata entry of these options.
    const title = ref('One')
    const live = await run(() => store.todos.liveQuery((q: any) => q.many(options(title.value))))
    expect(live.meta.value.label).toBe('One')
    expect(remote.callCount('fetchMany')).toBe(1)
    title.value = 'Two'
    await vi.waitFor(() => expect(live.meta.value.label).toBe('Two'))
    const again = await run(() => store.todos.query((q: any) => q.many(options('One'))))
    expect(again.meta.value.label).toBe('One')
  })
})
