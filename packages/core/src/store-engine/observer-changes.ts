import type { KeyId } from './internal-types.js'

/** Batched invalidations emitted after one engine observer flush. */
export interface ObserverChanges {
  /** Changed item identities by collection. */
  items: ReadonlyMap<string, ReadonlySet<KeyId>>
  /** Collections whose visible key membership or marker changed. */
  lists: ReadonlySet<string>
  /** Changed index buckets by collection and index key. */
  indexes: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>
}
