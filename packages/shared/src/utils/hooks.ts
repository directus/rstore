import type { CollectionDefaults, StoreSchema } from '../types/collection.js'
import type { HookDefinitions } from '../types/hooks.js'
import { createHooks as _createHooks } from './hookable.js'

export function createHooks<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
>() {
  return _createHooks<HookDefinitions<TSchema, TCollectionDefaults>>()
}

export type Hooks<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> = ReturnType<typeof createHooks<TSchema, TCollectionDefaults>>
