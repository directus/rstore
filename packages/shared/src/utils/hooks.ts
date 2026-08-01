import type { CollectionDefaults, StoreSchema } from '../types/collection.js'
import type { HookDefinitions } from '../types/hooks.js'
import { createHookable } from './hookable.js'

/**
 * Create a hookable instance typed with the rstore hook definitions for the
 * given schema and collection defaults.
 */
export function createHooks<
  TSchema extends StoreSchema = StoreSchema,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
>() {
  return createHookable<HookDefinitions<TSchema, TCollectionDefaults>>()
}

export type Hooks<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> = ReturnType<typeof createHooks<TSchema, TCollectionDefaults>>
