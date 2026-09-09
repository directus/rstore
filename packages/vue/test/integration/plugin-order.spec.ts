import type { Plugin } from '@rstore/shared'
// The only direct `createFakeRemote` left in the suite: the `scopeId` tests
// need *two* scoped backends on one store, which a stack (one remote) cannot
// express.
import { createFakeRemote } from '#test-utils/store/fakeRemote'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'

// `core/test/plugin-sort.spec.ts` covers plugin *sorting* in isolation, over
// plain objects. Everything about `setupPlugin` — which plugin's hook actually
// runs, for which collection, and what a plugin's `addCollectionDefaults`
// reaches — is only observable once a real store dispatches, so it lives here.

/** Plugin recording its name into `trace` when `fetchMany` runs. */
function tracer(name: string, trace: string[], extra: Partial<Plugin> = {}): Plugin {
  return {
    name,
    setup({ hook }) {
      hook('fetchMany', (payload: any) => {
        trace.push(name)
        payload.setResult([])
      })
    },
    ...extra,
  }
}

/**
 * Store over a single `items` collection, with no remote of its own.
 *
 * `remote: false` is what makes the hook ordering observable: a registered
 * fake remote would answer `fetchMany` before the plugins under test.
 */
function setup(plugins: Plugin[], schema: any[] = [{ name: 'items' }]) {
  return createVueStack({ schema, plugins, remote: false })
}

describe('hook dispatch across plugins', () => {
  it('runs hooks in registration order by default', async () => {
    const trace: string[] = []
    const { store } = await setup([tracer('a', trace), tracer('b', trace)])

    await store.items.findMany({ fetchPolicy: 'fetch-only' })

    expect(trace).toEqual(['a', 'b'])
  })

  it('honours `before.plugins` over registration order', async () => {
    const trace: string[] = []
    const { store } = await setup([
      tracer('a', trace),
      tracer('b', trace, { before: { plugins: ['a'] } }),
    ])

    await store.items.findMany({ fetchPolicy: 'fetch-only' })

    expect(trace).toEqual(['b', 'a'])
  })

  it('honours `after.categories`', async () => {
    const trace: string[] = []
    const { store } = await setup([
      tracer('processing', trace, { category: 'processing', after: { categories: ['remote'] } }),
      tracer('remote', trace, { category: 'remote' }),
    ])

    await store.items.findMany({ fetchPolicy: 'fetch-only' })

    expect(trace).toEqual(['remote', 'processing'])
  })

  it('stops the queue when a plugin aborts', async () => {
    const trace: string[] = []
    const { store } = await setup([
      {
        name: 'first',
        setup({ hook }) {
          hook('fetchMany', (payload: any) => {
            trace.push('first')
            payload.setResult([{ id: '1' }])
            payload.abort()
          })
        },
      },
      tracer('second', trace),
    ])

    const items = await store.items.findMany({ fetchPolicy: 'fetch-only' })

    expect(trace).toEqual(['first'])
    expect(items.map((item: any) => item.id)).toEqual(['1'])
  })
})

describe('scopeId routing', () => {
  it('sends each collection to the plugin owning its scope', async () => {
    const main = createFakeRemote({ scopeId: 'main', data: { users: [{ id: 'u1', name: 'Ada' }] } })
    const other = createFakeRemote({ scopeId: 'other', data: { logs: [{ id: 'l1', text: 'boot' }] } })
    const { store } = await setup(
      [main.plugin, other.plugin],
      [
        { name: 'users', scopeId: 'main' },
        { name: 'logs', scopeId: 'other' },
      ],
    )

    const users = await store.users.findMany({ fetchPolicy: 'fetch-only' })
    const logs = await store.logs.findMany({ fetchPolicy: 'fetch-only' })

    expect(users.map((user: any) => user.id)).toEqual(['u1'])
    expect(logs.map((log: any) => log.id)).toEqual(['l1'])
    expect(main.callCount('fetchMany', 'logs')).toBe(0)
    expect(other.callCount('fetchMany', 'users')).toBe(0)
  })

  it('calls a hook registered with `ignoreScope` for every collection', async () => {
    const seen: string[] = []
    const scoped = createFakeRemote({ scopeId: 'main', data: { users: [{ id: 'u1' }] } })
    const { store } = await setup(
      [
        scoped.plugin,
        {
          name: 'audit',
          scopeId: 'somewhere-else',
          setup({ hook }) {
            hook('beforeFetch', (payload: any) => {
              seen.push(payload.collection.name)
            }, { ignoreScope: true })
          },
        },
      ],
      [{ name: 'users', scopeId: 'main' }],
    )

    await store.users.findMany({ fetchPolicy: 'fetch-only' })

    expect(seen).toEqual(['users'])
  })

  it('skips a scoped plugin only for collections owned by another scope', async () => {
    const scoped: string[] = []
    const unscoped: string[] = []
    const { store } = await setup(
      [
        tracer('remote', []),
        {
          name: 'scoped-audit',
          scopeId: 'main',
          setup({ hook }) {
            hook('beforeFetch', (payload: any) => {
              scoped.push(payload.collection.name)
            })
          },
        },
        {
          name: 'global-audit',
          setup({ hook }) {
            hook('beforeFetch', (payload: any) => {
              unscoped.push(payload.collection.name)
            })
          },
        },
      ],
      [
        { name: 'users', scopeId: 'main' },
        { name: 'logs', scopeId: 'other' },
        { name: 'shared' },
      ],
    )

    await store.users.findMany({ fetchPolicy: 'fetch-only' })
    await store.logs.findMany({ fetchPolicy: 'fetch-only' })
    await store.shared.findMany({ fetchPolicy: 'fetch-only' })

    // Its own scope, plus the collection that claims no scope at all.
    expect(scoped).toEqual(['users', 'shared'])
    // A plugin without a `scopeId` is never filtered.
    expect(unscoped).toEqual(['users', 'logs', 'shared'])
  })
})

describe('addCollectionDefaults', () => {
  /** Plugin adding one field default for `items.title`. */
  function fieldDefault(name: string, field: Record<string, unknown>): Plugin {
    return {
      name,
      setup({ addCollectionDefaults }) {
        addCollectionDefaults({ fields: { title: field } })
      },
    }
  }

  it('merges the field defaults of several plugins onto the resolved collections', async () => {
    const parse = (value: string) => value.toUpperCase()
    const serialize = (value: string) => value.toLowerCase()
    const { store } = await setup([
      fieldDefault('parser', { parse }),
      fieldDefault('serializer', { serialize }),
    ])

    // Collections are resolved before the plugins run, so this only holds
    // because `store.ts` merges the defaults back afterwards.
    const field = store.$collections[0]!.fields!.title!
    expect(field.parse).toBe(parse)
    expect(field.serialize).toBe(serialize)
  })

  it('lets the last plugin overwrite the same field option', async () => {
    const first = (value: string) => `first:${value}`
    const last = (value: string) => `last:${value}`
    const { store } = await setup([
      fieldDefault('first', { parse: first }),
      fieldDefault('last', { parse: last }),
    ])

    expect(store.$collections[0]!.fields!.title!.parse).toBe(last)
  })
})

describe('cache filter composition', () => {
  it('applies every plugin cacheFilterMany hook to a cache read', async () => {
    const remote = createFakeRemote({
      data: {
        items: [
          { id: '1', kind: 'a', archived: false },
          { id: '2', kind: 'b', archived: false },
          { id: '3', kind: 'a', archived: true },
        ],
      },
    })
    const { store } = await setup([
      remote.plugin,
      {
        name: 'hide-archived',
        setup({ hook }) {
          hook('cacheFilterMany', (payload: any) => {
            payload.setResult(payload.getResult().filter((item: any) => !item.archived))
          })
        },
      },
      {
        name: 'only-kind-a',
        setup({ hook }) {
          hook('cacheFilterMany', (payload: any) => {
            payload.setResult(payload.getResult().filter((item: any) => item.kind === 'a'))
          })
        },
      },
    ])

    await store.items.findMany({ fetchPolicy: 'fetch-only' })
    const cached = store.items.peekMany()

    expect(cached.map((item: any) => item.id)).toEqual(['1'])
  })
})
