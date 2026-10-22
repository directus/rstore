import type { DevtoolsAdapter } from '../runtime/types'
import { observeVueStore } from './observation'
import { unwrapVueValue } from './unwrap'

/** Optional Vue boundary: neutral runtime never imports these framework utilities. */
export function createVueDevtoolsAdapter(): DevtoolsAdapter {
  return {
    unwrap: unwrapVueValue,
    observe: observeVueStore,
  }
}
