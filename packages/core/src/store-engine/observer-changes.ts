import type { KeyId } from './internal-types.js'

/** Explicit invalidations produced by one operation or queue flush. */
export interface EngineChangeSet {
  /** Changed item identities by collection. */
  items: ReadonlyMap<string, ReadonlySet<KeyId>>
  /** Collections whose visible key membership or marker changed. */
  lists: ReadonlySet<string>
  /** Changed opaque index dependencies. */
  indexes: ReadonlySet<string>
}

/** Backward-compatible name for observer flush payloads. */
export type ObserverChanges = EngineChangeSet
