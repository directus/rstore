import type { HookDefinitions } from '../types/hooks.js'
import type { ModelDefaults, ModelList } from '../types/model.js'
import { createHooks as _createHooks } from './hookable.js'

export function createHooks<
  TModelList extends ModelList,
  TModelDefaults extends ModelDefaults,
>() {
  return _createHooks<HookDefinitions<TModelList, TModelDefaults>>()
}

export type Hooks<
  TModelList extends ModelList,
  TModelDefaults extends ModelDefaults,
> = ReturnType<typeof createHooks<TModelList, TModelDefaults>>
