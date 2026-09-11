import type { EngineCallbacks, StoreEngine } from '../../src'
import { describe, expect, it } from 'vitest'
import { createStoreEngine } from '../../src'
import { buildCollection, buildLayer } from './helpers'

/** Create an engine with callback overrides for queue failure tests. */
function createEngine(callbacks: Partial<EngineCallbacks> = {}) {
  const user = buildCollection('User', {
    relations: {
      friends: { many: true, to: { User: { on: {} } } as any },
    },
  })
  const byName = new Map([[user.name, user]])
  const engine = createStoreEngine({
    isServer: true,
    callbacks: {
      getCollection: name => byName.get(name),
      resolveChildCollection: (_item, names) => names.includes('User') ? user : null,
      ...callbacks,
    },
  })
  return { engine, user }
}

describe('store-engine: transactional queue', () => {
  it('does not replay a committed write after its callback throws', () => {
    const error = new Error('write hook failed')
    const calls: Array<string | number | undefined> = []
    const { engine, user } = createEngine({
      onWriteCommitted(payload) {
        calls.push(payload.key)
        if (payload.key === 1) {
          throw error
        }
      },
    })

    engine.pause()
    engine.writeItem({ collection: user, key: 1, item: { id: 1 } })
    engine.writeItem({ collection: user, key: 2, item: { id: 2 } })

    expect(() => engine.resume()).toThrow(error)
    expect(engine.readItemRaw({ collection: user, key: 1 })).toEqual({ id: 1 })
    expect(engine.readItemRaw({ collection: user, key: 2 })).toBeUndefined()

    engine.resume()
    expect(engine.readItemRaw({ collection: user, key: 2 })).toEqual({ id: 2 })
    expect(calls).toEqual([1, 2])
  })

  it('keeps reentrant work queued when the current callback throws', () => {
    const error = new Error('reentrant hook failed')
    const calls: Array<string | number | undefined> = []
    let engine: StoreEngine
    const result = createEngine({
      onWriteCommitted(payload) {
        calls.push(payload.key)
        if (payload.key === 1) {
          engine.writeItem({ collection: result.user, key: 2, item: { id: 2 } })
          throw error
        }
      },
    })
    engine = result.engine

    expect(() => engine.writeItem({ collection: result.user, key: 1, item: { id: 1 } })).toThrow(error)
    expect(engine.readItemRaw({ collection: result.user, key: 2 })).toBeUndefined()

    engine.resume()
    expect(engine.readItemRaw({ collection: result.user, key: 2 })).toEqual({ id: 2 })
    expect(calls).toEqual([1, 2])
  })

  it('runs every committed relation effect even when one callback throws', () => {
    const error = new Error('first child hook failed')
    const calls: Array<string | number | undefined> = []
    const { engine, user } = createEngine({
      onWriteCommitted(payload) {
        calls.push(payload.key)
        if (payload.key === 2) {
          throw error
        }
      },
    })

    expect(() => engine.writeItem({
      collection: user,
      key: 1,
      item: { id: 1, friends: [{ id: 2 }, { id: 3 }] },
    })).toThrow(error)

    expect(engine.resolveKeys({ collection: user })).toEqual([2, 3, 1])
    expect(calls).toEqual([2, 3, 1])
  })

  it('preflights the whole relation tree before writing a child', () => {
    const { engine, user } = createEngine()

    expect(() => engine.writeItem({
      collection: user,
      key: 1,
      item: { id: 1, friends: [{ id: 2 }, { name: 'missing key' }] },
    })).toThrow('Could not determine key for relation User.friends')

    expect(engine.resolveKeys({ collection: user })).toEqual([])
    engine.writeItem({ collection: user, key: 4, item: { id: 4 } })
    expect(engine.resolveKeys({ collection: user })).toEqual([4])
  })

  it('consumes a layer operation before its callback throws', () => {
    const error = new Error('layer hook failed')
    let calls = 0
    const { engine, user } = createEngine({
      onLayerAdd() {
        calls++
        throw error
      },
    })

    expect(() => engine.addLayer(buildLayer('edit', 'User', { 1: { id: 1 } }))).toThrow(error)
    expect(engine.getLayer('edit')).toBeDefined()

    engine.resume()
    expect(calls).toBe(1)
    expect(engine.readItemRaw({ collection: user, key: 1 })).toMatchObject({ id: 1 })
  })

  it('resumes a batch at the next item after a nested callback fails', () => {
    const error = new Error('batch child failed')
    let shouldThrow = true
    const calls: Array<string | number | undefined> = []
    const { engine, user } = createEngine({
      onWriteCommitted(payload) {
        calls.push(payload.key)
        if (payload.key === 100 && shouldThrow) {
          throw error
        }
      },
    })
    engine.pause()
    engine.writeItems({
      collection: user,
      items: [
        { key: 1, value: { id: 1, friends: [{ id: 100 }] } },
        { key: 2, value: { id: 2, friends: [{ id: 200 }] } },
      ],
    })

    expect(() => engine.resume()).toThrow(error)
    expect(engine.readItemRaw({ collection: user, key: 1 })).toEqual({ id: 1 })
    expect(engine.readItemRaw({ collection: user, key: 2 })).toBeUndefined()

    shouldThrow = false
    engine.resume()
    expect(engine.readItemRaw({ collection: user, key: 2 })).toEqual({ id: 2 })
    expect(calls).toEqual([100, 200, undefined])
  })

  it('consumes a reset before its callback throws and drains later work on retry', () => {
    const error = new Error('reset failed')
    let shouldThrow = true
    const { engine, user } = createEngine({
      onReset() {
        if (shouldThrow) {
          throw error
        }
      },
    })
    engine.writeItem({ collection: user, key: 1, item: { id: 1 } })
    engine.pause()
    engine.clear()
    engine.writeItem({ collection: user, key: 2, item: { id: 2 } })

    expect(() => engine.resume()).toThrow(error)
    expect(engine.resolveKeys({ collection: user })).toEqual([])

    shouldThrow = false
    engine.resume()
    expect(engine.resolveKeys({ collection: user })).toEqual([2])
  })

  it('aggregates multiple failed effects after running all of them', () => {
    const calls: Array<string | number | undefined> = []
    const { engine, user } = createEngine({
      onWriteCommitted(payload) {
        calls.push(payload.key)
        if (payload.key === 2 || payload.key === 3) {
          throw new Error(`failed ${payload.key}`)
        }
      },
    })

    let thrown: unknown
    try {
      engine.writeItem({
        collection: user,
        key: 1,
        item: { id: 1, friends: [{ id: 2 }, { id: 3 }] },
      })
    }
    catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors).toHaveLength(2)
    expect(calls).toEqual([2, 3, 1])
  })
})
