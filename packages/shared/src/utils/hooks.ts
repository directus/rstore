import type { CollectionDefaults, StoreSchema } from '../types/collection.js'
import type { HookDefinitions } from '../types/hooks.js'
import { createHookable } from './hookable.js'

/**
 * Create a hookable instance typed with the rstore hook definitions for the
 * given schema and collection defaults.
 *
 * The explicit return type keeps the hook names generic in the emitted
 * declarations: an inferred type would freeze them into a literal union, and
 * hooks added by module augmentation (such as `cacheConflict` from
 * `@rstore/multiplayer`) could not be called on `store.$hooks`.
 */
export function createHooks<
  TSchema extends StoreSchema = StoreSchema,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
>(): ReturnType<typeof createHookable<HookDefinitions<TSchema, TCollectionDefaults>>> {
  return createHookable<HookDefinitions<TSchema, TCollectionDefaults>>()
}

export type Hooks<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> = ReturnType<typeof createHooks<TSchema, TCollectionDefaults>>
