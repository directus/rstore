import type { WrappedItem } from '../../src'
import { createCoreStack } from '#test-utils/store/coreStack'
import { findMany } from '@rstore/core'
import { describe, expect, it } from 'vitest'
import { pickNonSpecialProps, pickSpecialProps } from '../../src'

/**
 * Picking a wrapped item must copy stored fields without evaluating computed
 * properties or relations. This suite drives real wrapped items through the
 * public pick helpers and observes those effects.
 */

/** Number of times the `titleUpper` computed property was evaluated. */
let computedCalls = 0
/** Number of times the `author` relation resolved a candidate item. */
let relationCalls = 0

/**
 * Builds a store with a computed property and a relation, both instrumented,
 * and returns the wrapped `todos` item loaded through the fake remote.
 */
async function setup() {
  computedCalls = 0
  relationCalls = 0

  const { store, cache, remote } = await createCoreStack({
    data: {
      todos: [{ id: 't1', title: 'Write tests', authorId: 'u1' }],
      users: [{ id: 'u1', name: 'Ada' }],
    },
    schema: [
      {
        name: 'todos',
        computed: {
          titleUpper: (item: any) => {
            computedCalls++
            return String(item.title).toUpperCase()
          },
        },
        relations: {
          author: {
            to: {
              users: {
                on: { id: 'authorId' },
                filter: (_item: any, _related: any) => {
                  relationCalls++
                  return true
                },
              },
            },
          },
        },
      },
      { name: 'users' },
    ],
  })

  const todos = store.$collections.find(c => c.name === 'todos')!
  await findMany({ store, collection: todos, findOptions: { include: { author: true } } as any })

  const item = cache.readItem({ collection: todos, key: 't1' })! as WrappedItem<any, any, any>
  return { store, cache, remote, item }
}

describe('pickNonSpecialProps on a wrapped item', () => {
  it('keeps the real fields and drops computed properties and relations', async () => {
    const { item, remote } = await setup()
    const requestsBefore = remote.requests().length

    const picked = pickNonSpecialProps(item, true)

    expect(Object.keys(picked).sort()).toEqual(['authorId', 'id', 'title'])
    expect(picked).toEqual({ id: 't1', title: 'Write tests', authorId: 'u1' })
    // The proxy hid them, so neither getter ran and nothing was fetched.
    expect(computedCalls).toBe(0)
    expect(relationCalls).toBe(0)
    expect(remote.requests().length).toBe(requestsBefore)

    // Not vacuous: outside a pick the same proxy does expose both.
    expect(item.titleUpper).toBe('WRITE TESTS')
    expect(item.author?.name).toBe('Ada')
    expect(computedCalls).toBeGreaterThan(0)
    expect(relationCalls).toBeGreaterThan(0)
  })

  it('detaches the picked values from the cached item', async () => {
    const { item } = await setup()

    const picked = pickNonSpecialProps(item, true) as any
    picked.title = 'Mutated copy'

    expect(item.title).toBe('Write tests')
  })
})

describe('pickSpecialProps on a wrapped item', () => {
  it('picks the rstore-private props without invoking a computed property or a relation getter', async () => {
    const { cache, store, remote } = await setup()
    const todos = store.$collections.find(c => c.name === 'todos')!
    const optimistic = cache.wrapItem({
      collection: todos,
      item: { id: 't2', title: 'Draft', authorId: 'u1', $custom: { source: 'test' } } as any,
      noCache: true,
    })
    const requestsBefore = remote.requests().length

    const picked = pickSpecialProps(optimistic) as Record<string, any>

    expect(Object.keys(picked)).toEqual(['$custom'])
    expect(picked.$custom).toEqual({ source: 'test' })
    // Enumerating the item must not materialise anything: the pick only walks
    // the item's own data keys, never the proxy's computed or relation surface.
    expect(computedCalls).toBe(0)
    expect(relationCalls).toBe(0)
    expect(remote.requests().length).toBe(requestsBefore)
  })
})

describe('nested picks', () => {
  it('keeps the outer pick cloning while a nested pick runs', async () => {
    const { item } = await setup()

    // A getter that clones a related item — the shape user code passes to a
    // mutation or to form default values.
    const payload = {
      get authorPayload() {
        return pickNonSpecialProps(item.author as any, true)
      },
      todo: item,
    }

    const picked = pickNonSpecialProps(payload, true) as any

    // Desired: the outer pick is still cloning when it reaches `todo`, so the
    // clone carries the item's fields only.
    expect(Object.keys(picked.todo).sort()).toEqual(['authorId', 'id', 'title'])
  })
})

describe.each([
  ['non-special', pickNonSpecialProps, 'value'],
  ['special', pickSpecialProps, '$value'],
] as const)('%s pick failure recovery', (_name, pick, key) => {
  it('keeps wrapped item enumeration usable after a getter throws', async () => {
    const { item } = await setup()
    const keys = Object.keys(item)
    expect(keys).toContain('titleUpper')
    expect(keys).toContain('author')
    const failure = new Error('getter failed')
    const payload = {
      get [key]() {
        throw failure
      },
    }

    expect(() => pick(payload, true)).toThrow(failure)

    expect(Object.keys(item)).toEqual(keys)
    expect({ ...item }).toMatchObject({ titleUpper: 'WRITE TESTS', author: { name: 'Ada' } })
    expect(pickNonSpecialProps(item, true)).toEqual({ id: 't1', title: 'Write tests', authorId: 'u1' })
  })

  it('keeps an outer clone active when it catches a nested getter failure', async () => {
    const { item } = await setup()
    const payload = {
      get recovered() {
        expect(() => pick({
          get [key]() {
            throw new Error('nested failure')
          },
        }, true)).toThrow('nested failure')
        return true
      },
      todo: item,
    }

    const picked = pickNonSpecialProps(payload, true)

    expect(picked.todo).toEqual({ id: 't1', title: 'Write tests', authorId: 'u1' })
    expect(computedCalls).toBe(0)
    expect(relationCalls).toBe(0)
    expect(Object.keys(item)).toContain('titleUpper')
  })
})
