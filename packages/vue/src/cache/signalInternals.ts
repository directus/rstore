import type { ShallowRef } from 'vue'

/** One shared Vue version signal and its exact lifetime owners. */
export interface Signal {
  /** Version consumed by reactive readers. */
  ref: ShallowRef<number>
  /** Watchers or scopes currently retaining this signal. */
  owners: Set<object>
  /** Exact registry removal callback. */
  remove: () => void
}
