import type { HookDefinitions } from '../types/hooks.js'
import type { ModelDefaults, ModelMap } from '../types/model.js'
import { createHooks as _createHooks } from './hookable.js'

export function createHooks<
  TModelMap extends ModelMap,
  TModelDefaults extends ModelDefaults,
>() {
  return _createHooks<HookDefinitions<TModelMap, TModelDefaults>>()
}

export type Hooks<
  TModelMap extends ModelMap,
  TModelDefaults extends ModelDefaults,
> = ReturnType<typeof createHooks<TModelMap, TModelDefaults>>
