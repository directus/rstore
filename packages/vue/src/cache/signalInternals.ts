import type { EffectScope, ShallowRef } from 'vue'

/** One shared Vue version signal and its exact lifetime owners. */
export interface Signal {
  /** Version consumed by reactive readers. */
  ref: ShallowRef<number>
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
