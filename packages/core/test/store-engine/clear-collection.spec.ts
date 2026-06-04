import { describe, expect, it, vi } from 'vitest'
import { buildCollection, createTestEngine } from './helpers'

describe('store-engine: clearCollection', () => {
  it('removes every item of the collection', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    for (let i = 1; i <= 5; i++) {
      engine.writeItem({ collection, key: i, item: { id: i } })
    }

    engine.clearCollection({ collection })

    expect(engine.resolveKeys({ collection })).toEqual([])
  })

  it('notifies the list observer once for the whole clear, not once per item', () => {
    // Each deleted key touches the list; batching the loop behind a single
    // queue flush dedupes those into one observer dispatch.
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    for (let i = 1; i <= 5; i++) {
      engine.writeItem({ collection, key: i, item: { id: i } })
    }

    const listCb = vi.fn()
    engine.observeList('User', listCb)

    engine.clearCollection({ collection })

    expect(listCb).toHaveBeenCalledTimes(1)
  })

  it('leaves the queue paused-state unchanged when clearing while paused', () => {
    const collection = buildCollection('User')
    const { engine } = createTestEngine([collection])
    engine.writeItem({ collection, key: 1, item: { id: 1 } })

    engine.pause()
    engine.clearCollection({ collection })
    // While paused, the deletes stay queued (nothing applied yet).
    expect(engine.resolveKeys({ collection })).toEqual([1])

    engine.resume()
    expect(engine.resolveKeys({ collection })).toEqual([])
  })
})
