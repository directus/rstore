import type { VueStore } from '@rstore/vue'
import { mountStoreComponent } from '#test-utils/store/mountedComponent'
import { createVueStack } from '#test-utils/store/vueStack'
import { useStore } from '@rstore/vue'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'

/** Independent backend and store for each mounted application. */
function setup(title = 'One') {
  return createVueStack({
    schema: [{ name: 'todos' }],
    data: { todos: [{ id: '1', title }, { id: '2', title: 'Two' }] },
    tombstoneGc: false,
  })
}

/** Narrow the app-installed store to the schema this fixture installs. */
function useTodosStore() {
  return useStore() as VueStore<[{ name: 'todos' }]>
}

describe('mounted store consumers', () => {
  it('isolates injected stores and reactive query options across two mounted apps', async () => {
    const first = await setup('First app')
    const second = await setup('Second app')
    const key = ref('1')
    const a = mountStoreComponent(first.store, () => {
      const store = useTodosStore()
      const query = store.todos!.query(q => q.first(key.value))
      return { store, query, title: computed(() => query.data.value?.title) }
    })
    const b = mountStoreComponent(second.store, () => {
      const store = useTodosStore()
      return { store, query: store.todos!.query(q => q.first('1')) }
    })
    await Promise.all([a.result.query, b.result.query])
    expect(a.result.store).toBe(first.store)
    expect(b.result.store).toBe(second.store)
    expect(a.result.title.value).toBe('First app')
    expect(b.result.query.data.value?.title).toBe('Second app')

    key.value = '2'
    await nextTick()
    await vi.waitFor(() => expect(a.result.title.value).toBe('Two'))
    expect(b.result.query.data.value?.title).toBe('Second app')
    expect(second.remote.callCount('fetchFirst')).toBe(1)
  })

  it('releases subscriptions and ownership on unmount and fetches fresh data on remount', async () => {
    const stack = await setup()
    /** Opens the same public query in each component's real setup scope. */
    const mount = () => mountStoreComponent(stack.store, () => useTodosStore().todos!.liveQuery(q => q.first({
      key: '1',
      experimentalGarbageCollection: true,
    })))
    const first = mount()
    await first.result
    await vi.waitFor(() => expect(stack.remote.subscriptions()).toHaveLength(1))
    stack.cache.garbageCollect()
    expect(stack.read('todos', '1')?.title).toBe('One')

    first.unmount()
    await vi.waitFor(() => expect(stack.remote.subscriptions()).toHaveLength(0))
    stack.cache.garbageCollect()
    expect(stack.read('todos', '1')).toBeUndefined()

    stack.remote.respondNext('fetchFirst', row => ({ ...row, title: 'Remounted' }))
    const second = mount()
    await second.result
    await vi.waitFor(() => expect(stack.remote.subscriptions()).toHaveLength(1))
    expect(second.result.data.value?.title).toBe('Remounted')
    expect(stack.remote.callCount('fetchFirst')).toBe(2)
    second.unmount()
    await vi.waitFor(() => expect(stack.remote.subscriptions()).toHaveLength(0))
  })

  it.each(['cache-first', 'cache-and-fetch'] as const)('does not retain ownership after unmount during %s', async (fetchPolicy) => {
    const stack = await setup()
    const release = stack.remote.holdNext('fetchMany')
    onTestFinished(release)
    const component = mountStoreComponent(stack.store, () => useTodosStore().todos!.liveQuery(q => q.many({
      experimentalGarbageCollection: true,
      fetchPolicy,
    })))
    await vi.waitFor(() => {
      expect(stack.remote.callCount('fetchMany')).toBe(1)
      expect(stack.remote.subscriptions()).toHaveLength(1)
    })
    component.unmount()
    await vi.waitFor(() => expect(stack.remote.subscriptions()).toHaveLength(0))
    release()
    await component.result
    await component.result.background.promise
    await nextTick()
    stack.cache.garbageCollect()
    expect(stack.remote.subscriptions()).toHaveLength(0)
    expect(stack.remote.callCount('subscribe')).toBe(1)
    expect(stack.readMany('todos')).toEqual([])
  })

  it('releases a fetched secondary page when unmounted while its main page is still pending', async () => {
    const stack = await setup()
    const release = stack.remote.holdNext('fetchMany')
    onTestFinished(release)
    const component = mountStoreComponent(stack.store, () => useTodosStore().todos!.query(q => q.many({
      pageSize: 1,
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    await vi.waitFor(() => expect(stack.remote.callCount('fetchMany')).toBe(1))
    const secondary = component.result.fetchMore({ pageIndex: 1 })
    // Its row has arrived, but publication must wait for the main page.
    await vi.waitFor(() => expect(stack.read('todos', '2')?.title).toBe('Two'))
    component.unmount()
    release()
    await Promise.all([component.result, secondary])
    await nextTick()
    stack.cache.garbageCollect()
    expect(stack.readMany('todos')).toEqual([])
  })

  it('does not retain cached page ownership when a component mounts and immediately unmounts', async () => {
    const stack = await setup()
    /** Both consumers use the same already-cached page. */
    const mount = () => mountStoreComponent(stack.store, () => useTodosStore().todos!.query(q => q.many({
      resultMode: 'responseRefs',
      experimentalGarbageCollection: true,
    })))
    const current = mount()
    await current.result
    const transient = mount()
    transient.unmount()
    await transient.result
    expect(stack.remote.callCount('fetchMany')).toBe(1)
    expect(current.result.data.value.map(item => item.title)).toEqual(['One', 'Two'])
    current.unmount()
    await nextTick()
    stack.cache.garbageCollect()
    expect(stack.readMany('todos')).toEqual([])
  })

  it('keeps another mounted consumer\'s rows when an unmounted request settles', async () => {
    const stack = await setup()
    const release = stack.remote.holdNext('fetchMany')
    onTestFinished(release)
    const late = mountStoreComponent(stack.store, () => useTodosStore().todos!.query(q => q.many({
      experimentalGarbageCollection: true,
    })))
    await vi.waitFor(() => expect(stack.remote.callCount('fetchMany')).toBe(1))
    const current = mountStoreComponent(stack.store, () => useTodosStore().todos!.query(q => q.first({
      key: '1',
      experimentalGarbageCollection: true,
    })))
    await current.result
    late.unmount()
    release()
    await late.result
    await nextTick()
    stack.cache.garbageCollect()
    expect(current.result.data.value?.title).toBe('One')
    expect(stack.read('todos', '1')?.title).toBe('One')
    expect(stack.read('todos', '2')).toBeUndefined()
  })
})
