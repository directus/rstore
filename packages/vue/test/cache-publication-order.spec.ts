import { describe, expect, it } from 'vitest'
import { watchSyncEffect } from 'vue'
import { createStore } from '../src'

describe('cache publication order', () => {
  it('updates active wrappers before a cache-filter list signal reruns', async () => {
    const store = await createStore({ schema: [{ name: 'Card' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    store.$hooks.hook('cacheFilterMany', ({ collection: current, getResult, setResult }) => {
      if (current === collection)
        setResult((getResult() as any[]).filter(card => card.title === 'match'))
    })
    cache.writeItems({
      collection,
      items: [
        { key: 1, value: { id: 1, title: 'match' } },
        { key: 2, value: { id: 2, title: 'other' } },
      ],
    })

    const observed: number[][] = []
    const stop = watchSyncEffect(() => {
      observed.push((store as any).Card.peekMany().map((card: any) => card.id))
    })

    cache.writeItem({ collection, key: 2, item: { id: 2, title: 'match' }, marker: 'resync' })

    expectCompleteSnapshots(observed, [1], [1, 2])
    stop()
    cache.dispose()
  })

  it('stages every live batch value before a cache-filter watcher reruns', async () => {
    const store = await createStore({ schema: [{ name: 'Card' }], plugins: [] })
    const cache = store.$cache
    const collection = store.$collections[0]!
    store.$hooks.hook('cacheFilterMany', ({ collection: current, getResult, setResult }) => {
      if (current === collection)
        setResult((getResult() as any[]).filter(card => card.title === 'match'))
    })
    cache.writeItems({
      collection,
      items: [
        { key: 1, value: { id: 1, title: 'match' } },
        { key: 2, value: { id: 2, title: 'other' } },
        { key: 3, value: { id: 3, title: 'other' } },
      ],
    })

    const observed: number[][] = []
    const stop = watchSyncEffect(() => {
      observed.push((store as any).Card.peekMany().map((card: any) => card.id))
    })

    cache.writeItems({
      collection,
      marker: 'resync',
      items: [
        { key: 2, value: { id: 2, title: 'match' } },
        { key: 3, value: { id: 3, title: 'match' } },
      ],
    })

    expectCompleteSnapshots(observed, [1], [1, 2, 3])
    stop()
    cache.dispose()
  })
})

/** Assert every synchronous rerun observes one complete state transition. */
function expectCompleteSnapshots(observed: number[][], initial: number[], updated: number[]): void {
  expect(observed[0]).toEqual(initial)
  const postWrite = observed.slice(1)
  expect(postWrite).not.toHaveLength(0)
  for (const snapshot of postWrite)
    expect(snapshot).toEqual(updated)
}
