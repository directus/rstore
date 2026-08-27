import type { IndexValueId, KeyId, ObserverRegistry } from './internal-types.js'
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

/** Record one canonical item identity. */
export function touchItem(changes: MutableEngineChangeSet, collection: string, key: string | number): void {
  const keys = changes.items.get(collection) ?? new Set<KeyId>()
  changes.items.set(collection, keys)
  keys.add(String(key))
}

/** Record one collection membership dependency. */
export function touchList(changes: MutableEngineChangeSet, collection: string): void {
  changes.lists.add(collection)
}

/** Record one opaque index dependency identity. */
export function touchIndex(
  changes: MutableEngineChangeSet,
  collection: string,
  indexKey: string,
  indexValueId: IndexValueId,
): void {
  changes.indexes.add(getIndexDependencyId(collection, indexKey, indexValueId))
}

/** Encode collection, index, and value without delimiter collisions. */
export function getIndexDependencyId(collection: string, indexKey: string, indexValueId: IndexValueId): string {
  return `${encodePart(collection)}${encodePart(indexKey)}${encodePart(indexValueId)}`
}

/** Merge one committed operation journal into its flush journal. */
export function mergeChangeSets(target: MutableEngineChangeSet, source: EngineChangeSet): void {
  for (const [collection, sourceKeys] of source.items) {
    const keys = target.items.get(collection) ?? new Set<KeyId>()
    target.items.set(collection, keys)
    for (const key of sourceKeys) keys.add(key)
  }
  for (const collection of source.lists) target.lists.add(collection)
  for (const dependency of source.indexes) target.indexes.add(dependency)
}

/** Add every direct observer owned by a collection during reset. */
export function invalidateObservedCollection(
  observers: ObserverRegistry,
  changes: MutableEngineChangeSet,
  collection: string,
): void {
  observers.collectCollection(changes, collection)
}

/** Return whether one journal has no reactive invalidations. */
export function isChangeSetEmpty(changes: EngineChangeSet): boolean {
  return changes.items.size === 0 && changes.lists.size === 0 && changes.indexes.size === 0
}

/** Length-prefix one dependency component. */
function encodePart(value: string): string {
  return `${value.length}:${value}`
}
