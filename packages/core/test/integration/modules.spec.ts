import type { CreateModuleApi, GlobalStoreType, ResolvedModule } from '@rstore/shared'
import { createCoreStack } from '#test-utils/store/coreStack'
import { hydrate } from '#test-utils/store/ssr'
import { defineModule } from '@rstore/core'
import { describe, expect, it } from 'vitest'

// `defineModule` is a documented feature (rstore.dev/guide/data/module.html)
// with a bug history (`4d458c9 fix(module): module getting disposed`) and, up
// to this file, no test importing it. These run it against the real cache, so
// state identity, the SSR round trip and `cache.clear()` are all exercised
// through `packages/vue/src/cache/api.ts:getModuleState`.

/** Core store on the real cache, with a single `todos` collection. */
function setup() {
  return createCoreStack({
    schema: [{ name: 'todos' }],
    remote: false,
    syncImmediately: false,
  })
}

/** Shorthand for `defineModule` on a core store, which needs no Vue context. */
function defineOn<TExposed extends Record<string, any>>(
  store: any,
  name: string,
  cb: (api: CreateModuleApi<any>) => TExposed,
) {
  return defineModule<{ name: string, state: any }, TExposed, any>(store as GlobalStoreType as any, name, cb)
}

/** Resolves a `counter` module holding one keyed state on `store`. */
function buildCounter(store: any) {
  return defineOn(store, 'counter', ({ defineState }) => ({
    state: defineState({ count: 0 }, 'main'),
  }))()
}

describe('module state', () => {
  it('assigns stable auto keys to unkeyed states', async () => {
    const { store } = await setup()

    const module = defineOn(store, 'counter', ({ defineState }) => ({
      a: defineState({ count: 0 }),
      b: defineState({ label: 'b' }),
      c: defineState({ custom: true }, 'named'),
    }))()

    // Keys are what a hydrated payload is looked up by, so their derivation
    // from call order is part of the contract, not an implementation detail.
    expect(Object.keys(module.$state)).toEqual(['0', '1', 'named'])
    expect(module.$state['0']).toBe(module.a)
    expect(module.$state.named).toBe(module.c)
  })

  it('reads back the same state object when the module is resolved twice', async () => {
    const { store } = await setup()

    const factory = defineOn(store, 'counter', ({ defineState }) => ({
      state: defineState({ count: 0 }),
    }))

    const first = factory()
    first.state.count = 3
    const second = factory()

    // Core has no module cache: both resolutions go through
    // `store.$cache.getModuleState`, which is what keeps two callers of the
    // same module looking at one state.
    expect(second.state).toBe(first.state)
    expect(second.state.count).toBe(3)
    expect(store.$cache.getModuleState('counter', '0', { count: 99 } as any)).toBe(first.state)
  })

  it('carries state across an SSR payload round trip', async () => {
    const server = await setup()
    const client = await setup()

    buildCounter(server.store).state.count = 7
    // A Nuxt app serializes `getState()` into the payload and calls
    // `setState` on the client. JSON stands in for that transport.
    client.cache.setState(JSON.parse(JSON.stringify(server.cache.getState())))

    // The client module must adopt the payload value instead of its own
    // initial state, or a hydrated page flashes back to zero.
    expect(buildCounter(client.store).state.count).toBe(7)
  })

  it('leaves module state structured-cloneable, like collection state', async () => {
    const server = await setup()
    const client = await setup()

    buildCounter(server.store).state.count = 7
    hydrate(client.cache, server.cache.getState())

    expect(buildCounter(client.store).state.count).toBe(7)
  })

  it('is emptied by `cache.clear()` and still usable afterwards', async () => {
    const { store, cache } = await setup()

    const factory = defineOn(store, 'counter', ({ defineState }) => ({
      state: defineState({ count: 0 }),
    }))
    factory().state.count = 5

    cache.clear()

    // `clearNow` resets every module ref to `{}`, so a module resolved after a
    // cache reset starts from an empty state and keeps writing to the cache.
    const afterClear = factory()
    expect(afterClear.state).toEqual({})
    afterClear.state.count = 1
    expect(store.$cache.getModuleState('counter', '0', {})).toEqual({ count: 1 })
  })
})

describe('module mutations', () => {
  it('records one `module-mutation` entry with the module name, key and arguments', async () => {
    const { store } = await setup()

    const module = defineOn(store, 'counter', ({ defineState, defineMutation }) => {
      const state = defineState({ count: 0 })
      return {
        state,
        increment: defineMutation((by: number, _reason: string) => {
          state.count += by
          return state.count
        }),
      }
    })()

    expect(module.increment(2, 'click')).toBe(2)

    expect(store.$mutationHistory).toHaveLength(1)
    expect(store.$mutationHistory[0]).toMatchObject({
      operation: 'module-mutation',
      module: 'counter',
      key: 'increment',
      payload: [2, 'click'],
    })
  })

  it('records the exposed key, not the local variable name', async () => {
    const { store } = await setup()

    const module = defineOn(store, 'counter', ({ defineMutation }) => {
      const localName = defineMutation(() => 'done')
      // The key is resolved lazily from `_exposed` on first call
      // (`module.ts:52`), which is the only thing that lets a renamed export
      // be reported under the name consumers and devtools actually see.
      return { renamed: localName }
    })()

    module.renamed()

    expect(store.$mutationHistory[0]).toMatchObject({ key: 'renamed' })
  })
})

describe('module resolution', () => {
  it('runs `onResolve` callbacks in registration order before `moduleResolved`', async () => {
    const { store } = await setup()
    const trace: string[] = []

    store.$hooks.hook('moduleResolved', ({ module }: { module: ResolvedModule<any, any> }) => {
      trace.push(`hook:${module.$module}`)
    })

    const module = defineOn(store, 'counter', ({ onResolve }) => {
      onResolve(async () => {
        await Promise.resolve()
        trace.push('first')
      })
      onResolve(() => {
        trace.push('second')
      })
      return { ok: true }
    })()

    // Nothing ran yet: the callbacks are driven by the promise the factory
    // returned, so a caller that never awaits still gets a usable module.
    expect(trace).toEqual([])

    await module

    expect(trace).toEqual(['first', 'second', 'hook:counter'])
  })

  it('returns a value usable both synchronously and as a promise', async () => {
    const { store } = await setup()

    const module = defineOn(store, 'counter', ({ defineState }) => ({
      state: defineState({ count: 4 }),
      label: 'counter module',
    }))()

    // `Object.assign(promise, resolvedModule)`: the same object is a thenable
    // and the resolved module, so a component can read state during setup
    // without awaiting.
    expect(module.$module).toBe('counter')
    expect(module.label).toBe('counter module')
    expect(module.state.count).toBe(4)

    const awaited = await module
    expect(awaited.label).toBe('counter module')
    expect(awaited.$state['0']).toBe(module.state)
  })
})
