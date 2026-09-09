import { withInjectionContext, withScope } from '#test-utils/store/vueApp'
import { createVueStack } from '#test-utils/store/vueStack'
import { describe, expect, it } from 'vitest'
import { nextTick, ref, watchEffect } from 'vue'
import { defineModule } from '../../src'

// The Vue layer of `defineModule` is 41 lines doing four things core cannot:
// resolve the store from the injection context, dedupe modules through
// `$modulesCache`, run the module in a *detached* effect scope (the fix in
// `4d458c9 fix(module): module getting disposed`) and refuse to run with no
// store at all. None of it was reached by a test before this file.

/** Real Vue store over a single `todos` collection. */
async function setup() {
  const { store } = await createVueStack({ schema: [{ name: 'todos' }], remote: false })
  return store
}

describe('store resolution', () => {
  it('resolves the store from the injection context', async () => {
    const store = await setup()
    const factory = defineModule('counter', ({ defineState }) => ({
      state: defineState({ count: 1 }),
    }))

    const module = withInjectionContext(store, () => factory()).result

    // The state came from *this* store's cache, which is the only proof the
    // module resolved the injected store rather than some ambient default.
    expect(store.$cache.getModuleState('counter', '0', { count: 99 })).toBe(module.state)
  })

  it('returns the identical module for a second call with the same callback', async () => {
    const store = await setup()
    const factory = defineModule('counter', ({ defineState }) => ({
      state: defineState({ count: 0 }),
    }))

    const first = withInjectionContext(store, () => factory()).result
    first.state.count = 5
    const second = withInjectionContext(store, () => factory()).result

    // `$modulesCache` (module.ts:23) is keyed by the callback: without it every
    // component calling `useCounter()` would build its own module, so
    // `onResolve` side effects (initial fetches) would run once per consumer.
    expect(second).toBe(first)
    expect(second.state.count).toBe(5)
  })

  it('deduplicates before asynchronous module resolution finishes', async () => {
    const store = await setup()
    let builds = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const factory = defineModule('counter', ({ onResolve }) => {
      builds++
      onResolve(() => gate)
      return { state: { count: 0 } }
    })

    const first = withInjectionContext(store, () => factory()).result
    const second = withInjectionContext(store, () => factory()).result

    expect(second).toBe(first)
    expect(builds).toBe(1)

    release()
    await first
  })

  it('accepts an explicit store outside of a setup', async () => {
    const store = await setup()
    const factory = defineModule('counter', ({ defineState }) => ({
      state: defineState({ count: 2 }),
    }))

    expect(factory(store as any).state.count).toBe(2)
  })

  it('throws outside of a setup with no store', async () => {
    await setup()
    const factory = defineModule('counter', () => ({ ok: true }))

    // No injection context here and no store argument: the module must say so
    // instead of silently building against nothing.
    expect(() => factory()).toThrow('Rstore module used outside of a Vue component setup or without active store')
  })
})

describe('module effect scope', () => {
  it('survives the disposal of the scope that created it', async () => {
    const store = await setup()
    const factory = defineModule('counter', ({ defineState }) => {
      const state = defineState({ count: 1 })
      const doubled = ref(0)
      watchEffect(() => {
        doubled.value = state.count * 2
      })
      return { state, doubled }
    })

    const { result: module, stop } = withScope(
      () => withInjectionContext(store, () => factory()).result,
    )
    await nextTick()
    expect(module.doubled.value).toBe(2)

    // Regression for `4d458c9`: the module is cached per store, so the first
    // component to build it must not own it. With a non-detached
    // `effectScope()`, unmounting that component stopped every effect the
    // module had registered and it silently went dead for everyone else.
    stop()

    module.state.count = 4
    await nextTick()

    expect(module.doubled.value).toBe(8)
  })
})

describe('module mutations', () => {
  it('exposes live `$loading`, `$error` and `$time` through the real `wrapMutation`', async () => {
    const store = await setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const factory = defineModule('counter', ({ defineMutation }) => ({
      save: defineMutation(async () => {
        await gate
        return 'saved'
      }),
      fail: defineMutation(async () => {
        throw new Error('mutation failed')
      }),
    }))
    const module = withInjectionContext(store, () => factory()).result

    expect(module.save.$loading).toBe(false)

    const promise = module.save()
    // The Vue store swaps `$wrapMutation` for the real one, so telemetry has
    // to be readable *while* the mutation is in flight — that is what a
    // template binds a spinner to.
    expect(module.save.$loading).toBe(true)

    release()
    await expect(promise).resolves.toBe('saved')

    expect(module.save.$loading).toBe(false)
    expect(module.save.$error).toBeNull()
    expect(module.save.$time).toBeGreaterThan(0)

    await expect(module.fail()).rejects.toThrow('mutation failed')
    expect(module.fail.$error).toMatchObject({ message: 'mutation failed' })
    expect(module.fail.$loading).toBe(false)

    expect(store.$mutationHistory.map((entry: any) => entry.key)).toEqual(['save', 'fail'])
  })
})
