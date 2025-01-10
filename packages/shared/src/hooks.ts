import type { Hooks } from './types/hooks.js'
import { createHooks } from './util/hookable.js'

export const hooks = createHooks<Hooks>()
