import type { KeyId } from './internal-types.js'

/** Dynamic dependencies consumed by one selective state-change bridge. */
export interface EngineChangeInterest {
  /** Exact canonical keys, or `true` for collection-wide item interest. */
  itemKeys: ReadonlyMap<string, true | ReadonlySet<KeyId>>
  /** Collections with active visible-list readers. */
  lists: ReadonlySet<string>
  /** Opaque index dependency ids grouped by owning collection. */
  indexes: ReadonlyMap<string, ReadonlySet<string>>
}

/** Explicit invalidations produced by one operation or queue flush. */
export interface EngineChangeSet {
  /** Changed item identities by collection. */
  items: ReadonlyMap<string, ReadonlySet<KeyId>>
  /** Collections whose visible key membership or marker changed. */
  lists: ReadonlySet<string>
  /** Changed opaque index dependencies. */
  indexes: ReadonlySet<string>
}
