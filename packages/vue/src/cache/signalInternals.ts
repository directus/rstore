import type { Unsubscribe } from '@rstore/core'
import type { CacheIndexValue } from '@rstore/shared'
import type { EffectScope, ShallowRef } from 'vue'

/** One shared Vue version signal and its exact lifetime owners. */
export interface Signal {
  /** Version consumed by reactive readers. */
  ref: ShallowRef<number>
  /** Engine observer cleanup. */
  stop: Unsubscribe
  /** Whether observer cleanup already ran. */
  stopped: boolean
  /** Watchers or scopes currently retaining this signal. */
  owners: Set<object>
  /** Exact registry removal callback. */
  remove: () => void
}

/** Watcher-first owner selected for one reactive cache read. */
export interface SignalOwner {
  /** Vue watcher or effect-scope identity. */
  value: object
  /** Enclosing scope, used only when no watcher exists. */
  scope?: EffectScope
}

/** Build stable Vue registry identity without flattening tuple values. */
export function getIndexSignalId(value: CacheIndexValue): string {
  return Array.isArray(value)
    ? `tuple:${JSON.stringify(value.map(String))}`
    : `scalar:${JSON.stringify(String(value))}`
}
