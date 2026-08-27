import type { IndexValueId, KeyId } from './internal-types.js'
import type { EngineChangeSet } from './observer-changes.js'

/** Mutable engine journal used while one operation commits. */
export interface MutableEngineChangeSet extends EngineChangeSet {
  /** Changed item identities by collection. */
  items: Map<string, Set<KeyId>>
  /** Collections whose visible membership changed. */
  lists: Set<string>
  /** Opaque index dependency identities whose membership changed. */
  indexes: Set<string>
}

/** Create one empty operation-local mutation journal. */
export function createEngineChangeSet(): MutableEngineChangeSet {
  return { items: new Map(), lists: new Set(), indexes: new Set() }
}

/** Encode collection, index, and value without delimiter collisions. */
export function getIndexDependencyId(collection: string, indexKey: string, indexValueId: IndexValueId): string {
  return `${encodePart(collection)}${encodePart(indexKey)}${encodePart(indexValueId)}`
}

/** Return whether one journal has no reactive invalidations. */
export function isChangeSetEmpty(changes: EngineChangeSet): boolean {
  return changes.items.size === 0 && changes.lists.size === 0 && changes.indexes.size === 0
}

/** Length-prefix one dependency component. */
function encodePart(value: string): string {
  return `${value.length}:${value}`
}
