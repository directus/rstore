import type { CollectionDefaults, Hooks, StoreSchema } from '../src'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { createHookable, createHooks, Hookable } from '../src'

describe('public shared exports', () => {
  it('exports the raw hookable factory and class', () => {
    const hooks = createHookable<{ test: (value: string) => void }>()
    expect(hooks).toBeInstanceOf(Hookable)
  })

  // Regression for the barrel shadowing bug: the explicit `createHooks`
  // re-export from hookable.js used to hide the typed wrapper in hooks.js.
  it('exports the typed createHooks bound to the rstore hook definitions', () => {
    const hooks = createHooks()
    expect(hooks).toBeInstanceOf(Hookable)

    expectTypeOf(createHooks<StoreSchema, CollectionDefaults>()).toEqualTypeOf<Hooks<StoreSchema, CollectionDefaults>>()
    // The typed wrapper exposes store hook names, not an arbitrary map.
    expectTypeOf(hooks.hook).parameter(0).toMatchTypeOf<string>()
    expectTypeOf(hooks).not.toEqualTypeOf<Hookable<Record<string, any>>>()
  })
})
