import type { HookDefinitions } from '../types/hooks.js'
import type { Model, ModelDefaults } from '../types/model.js'
import { createHooks as _createHooks } from './hookable.js'

export function createHooks<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
>() {
  return _createHooks<HookDefinitions<TModel, TModelDefaults>>()
}

export type Hooks<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
> = ReturnType<typeof createHooks<TModel, TModelDefaults>>
