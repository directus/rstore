import type { HookDefinitions } from '../types/hooks.js'
import type { ModelDefaults, StoreSchema } from '../types/model.js'
import { createHooks as _createHooks } from './hookable.js'

export function createHooks<
  TSchema extends StoreSchema,
  TModelDefaults extends ModelDefaults,
>() {
  return _createHooks<HookDefinitions<TSchema, TModelDefaults>>()
}

export type Hooks<
  TSchema extends StoreSchema,
  TModelDefaults extends ModelDefaults,
> = ReturnType<typeof createHooks<TSchema, TModelDefaults>>
