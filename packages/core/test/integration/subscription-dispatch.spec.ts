import type { Plugin, StoreSchema } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { subscribe, unsubscribe } from '@rstore/core'
import { describe, expect, it } from 'vitest'

// `test/subscription/{subscribe,unsubscribe}.spec.ts` asserted ten times that
// `callHook` had been called with `expect.objectContaining({ … })` against a
// bare `{ $hooks: createHooks() }`. A spy on `callHook` cannot tell a
// subscription a backend actually holds from one it never opened, and cannot
// tell a `meta` object a plugin can write into from `undefined`. Both files
// collapse here, asserted against `remote.subscriptions()` — the registrations
// the fake backend still holds — and against what a plugin really received.
//
// `subscribe.ts` and `unsubscribe.ts` are two copies of the same dispatch, so
// every test drives both directions: a divergence between them is the bug.

const schema: StoreSchema = [{ name: 'todos' }]

/** The `meta` objects each hook received, in call order. */
interface SeenMeta {
  subscribe: any[]
  unsubscribe: any[]
}

/**
 * Plugin that stamps transport state into `meta`, the way a real connector
 * records the channel it opened.
 *
 * Writing into `meta` — rather than only reading it — is what makes the
 * "`meta` is never nullish" claim falsifiable: without the default, the write
 * throws and the mutation rejects.
 *
 * @param seen Collects the `meta` object of every call, by hook.
 */
function metaWriter(seen: SeenMeta): Plugin {
  return {
    name: 'meta-writer',
    setup({ hook }: any) {
      for (const name of ['subscribe', 'unsubscribe'] as const) {
        hook(name, (payload: any) => {
          payload.meta[name] = true
          seen[name].push(payload.meta)
        })
      }
    },
  }
}

/** Core stack with a `todos` collection and a meta-writing plugin. */
async function setup() {
  const seen: SeenMeta = { subscribe: [], unsubscribe: [] }
  const stack = await createCoreStack({ schema, plugins: [metaWriter(seen)] })
  return { ...stack, seen, collection: stack.collection('todos') }
}

describe('subscription registration', () => {
  it('opens a registration the backend holds until unsubscribe closes that same id', async () => {
    const { store, collection, remote } = await setup()

    await subscribe({ store, collection, subscriptionId: 'sub-1' })
    await subscribe({ store, collection, subscriptionId: 'sub-2' })
    expect(remote.subscriptions()).toEqual(['sub-1', 'sub-2'])

    // Only a `subscriptionId` that survived both dispatches intact can close
    // the registration the first one opened.
    await unsubscribe({ store, collection, subscriptionId: 'sub-1' })
    expect(remote.subscriptions()).toEqual(['sub-2'])
  })

  it('sends the key and the find options on to the plugins, in both directions', async () => {
    const { store, collection, remote } = await setup()
    const findOptions = { params: { where: { done: false } } } as any

    await subscribe({ store, collection, subscriptionId: 'sub-1', key: '1', findOptions })
    await unsubscribe({ store, collection, subscriptionId: 'sub-1', key: '1', findOptions })

    // A keyed subscription that reached the backend as a collection-wide one
    // would silently deliver every row of the collection.
    expect(remote.lastRequest('subscribe')).toMatchObject({ collection: 'todos', key: '1', findOptions })
    expect(remote.lastRequest('unsubscribe')).toMatchObject({ collection: 'todos', key: '1', findOptions })
  })

  it('uses matching default payloads when callers omit metadata and query details', async () => {
    const payloads: Record<'subscribe' | 'unsubscribe', any[]> = { subscribe: [], unsubscribe: [] }
    const stack = await createCoreStack({
      schema,
      plugins: [{
        name: 'payload-observer',
        setup({ hook }: any) {
          for (const name of ['subscribe', 'unsubscribe'] as const) {
            hook(name, (payload: any) => payloads[name].push(payload))
          }
        },
      }],
    })
    const collection = stack.collection('todos')

    await subscribe({ store: stack.store, collection, subscriptionId: 'sub-defaults' })
    expect(stack.remote.subscriptions()).toEqual(['sub-defaults'])
    await unsubscribe({ store: stack.store, collection, subscriptionId: 'sub-defaults' })

    expect(stack.remote.subscriptions()).toEqual([])
    expect(payloads.subscribe[0]).toMatchObject({
      collection,
      subscriptionId: 'sub-defaults',
      key: undefined,
      findOptions: undefined,
      meta: {},
    })
    expect(payloads.unsubscribe[0]).toMatchObject({
      collection,
      subscriptionId: 'sub-defaults',
      key: undefined,
      findOptions: undefined,
      meta: {},
    })
    expect(payloads.subscribe[0].meta).not.toBe(payloads.unsubscribe[0].meta)
  })
})

describe('subscription meta', () => {
  it('hands the caller meta object itself to the plugins, so what they stamp comes back', async () => {
    const { store, collection, seen } = await setup()
    const meta = { requestId: 'r1' } as any

    await subscribe({ store, collection, subscriptionId: 'sub-1', meta })
    await unsubscribe({ store, collection, subscriptionId: 'sub-1', meta })

    expect(seen.subscribe[0]).toBe(meta)
    expect(seen.unsubscribe[0]).toBe(meta)
    expect(meta).toEqual({ requestId: 'r1', subscribe: true, unsubscribe: true })
  })

  it('falls back to the find options meta, so a query and its subscription share one', async () => {
    const { store, collection, seen } = await setup()
    const findOptions = { meta: { requestId: 'r1' } } as any

    await subscribe({ store, collection, subscriptionId: 'sub-1', findOptions })
    await unsubscribe({ store, collection, subscriptionId: 'sub-1', findOptions })

    expect(seen.subscribe[0]).toBe(findOptions.meta)
    expect(seen.unsubscribe[0]).toBe(findOptions.meta)
    expect(findOptions.meta).toEqual({ requestId: 'r1', subscribe: true, unsubscribe: true })
  })

  it('defaults to a fresh empty object per call, so a plugin never writes into undefined', async () => {
    const { store, collection, seen } = await setup()

    await subscribe({ store, collection, subscriptionId: 'sub-1' })
    await subscribe({ store, collection, subscriptionId: 'sub-2' })
    await unsubscribe({ store, collection, subscriptionId: 'sub-1' })

    expect(seen.subscribe[0]).toEqual({ subscribe: true })
    expect(seen.unsubscribe[0]).toEqual({ unsubscribe: true })
    // A shared default would carry one subscription's transport state into the
    // next one's plugins.
    expect(seen.subscribe[1]).not.toBe(seen.subscribe[0])
  })
})
