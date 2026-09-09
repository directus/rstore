import type { CacheLayer, Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItem, StoreCore, StoreSchema } from '@rstore/shared'
import { pickNonSpecialProps } from '@rstore/shared'
import { fieldValuesEqual } from '../utils/equality'

/** Known application values paired with the wire values exposed to hooks. */
export interface MutationItemSnapshot {
  /** Values used by optimistic cache layers. */
  optimisticItem: Record<string, any>
  /** Detached wire values, unaffected by in-place hook edits. */
  transportSnapshot: Record<string, any>
}

/**
 * Throw when the current cache layer blocks a mutation against an item.
 *
 * This guard runs before mutation hooks and remote dispatch, so a pending
 * optimistic create cannot be overwritten or deleted by a competing request.
 *
 * @param store Store that owns the cache layer.
 * @param collection Collection containing the item.
 * @param key Item key to inspect.
 * @param mutation Mutation the caller intends to dispatch.
 */
export function assertMutationAllowed<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  store: StoreCore<TSchema, TCollectionDefaults>,
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>,
  key: string | number,
  mutation: 'update' | 'delete',
): void {
  const layer = store.$cache.readItem({ collection, key })?.$layer as CacheLayer | undefined
  if (!layer?.prevent?.[mutation]) {
    return
  }

  console.error(layer)
  const operation = mutation === 'delete' ? 'deletion' : mutation
  throw new Error(`Item ${operation} prevented by the layer: ${layer.id}`)
}

/**
 * Own one optimistic layer through remote dispatch and commit/rollback.
 *
 * Callers still build their operation-specific layer. This helper only keeps
 * removal before committed cache writes and on failures consistent.
 */
export function createOptimisticLayerLifecycle<
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(store: StoreCore<TSchema, TCollectionDefaults>) {
  let layer: CacheLayer | undefined

  return {
    /** Register the operation-specific layer before remote dispatch starts. */
    add(nextLayer: CacheLayer) {
      layer = nextLayer
      store.$cache.addLayer(nextLayer)
    },
    /** Remove the live layer before commit or while rolling back an error. */
    remove() {
      if (layer) {
        store.$cache.removeLayer(layer.id)
        layer = undefined
      }
    },
  }
}

/**
 * Build independent cache and transport representations of a mutation item.
 *
 * Parsing is intentionally absent. The optimistic layer uses application
 * values, while the transport copy is serialized for remote hooks. Calling parse
 * here would run user parsing once for the layer and once for the response.
 */
export function prepareMutationItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  store: StoreCore<TSchema, TCollectionDefaults>,
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>,
  item: Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>,
  previous?: MutationItemSnapshot | MutationItemSnapshot[],
) {
  // Before hooks receive transport values. A replacement can spread those
  // values while editing another field; recover their known application values
  // before serializing, without invoking parsers on optimistic data.
  const applicationItem = previous
    ? restoreApplicationValues(item, Array.isArray(previous) ? previous : [previous])
    : item
  const optimisticItem = pickNonSpecialProps(applicationItem, true) as Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
  const transportItem = pickNonSpecialProps(optimisticItem, true) as Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>
  store.$processItemSerialization(collection, transportItem)
  // Hooks can mutate their payload before passing it to setItem. Compare with
  // a detached snapshot so those edits cannot change the restoration baseline.
  const transportSnapshot = pickNonSpecialProps(transportItem, true)
  return { optimisticItem, transportItem, transportSnapshot }
}

/**
 * Whether two structurally equal values also agree on nullish identity.
 *
 * `fieldValuesEqual` treats `null` and `undefined` as equal, which is the right
 * contract for change detection but not for restoration: a hook clearing a
 * field to `undefined` would otherwise match the baseline holding `null` and
 * lose the replacement. Only called on pairs equality already accepted, so the
 * walk descends the containers whose entries equality compares in turn — arrays,
 * `Map` values and plain objects — and takes its verdict for anything else. Set
 * members and Map keys need no walk: equality matches them by identity, which
 * already tells the two nullish values apart.
 *
 * @param value Replacement value proposed by a hook.
 * @param snapshot Matching detached wire values of a previous item.
 * @param visited Pairs already being compared, to stop on cyclic values.
 */
function nullishValuesMatch(value: any, snapshot: any, visited: WeakMap<object, WeakSet<object>> = new WeakMap()): boolean {
  if (Object.is(value, snapshot)) {
    return true
  }
  if (value == null || snapshot == null) {
    // One side is nullish and the two are not the same value: either a value
    // replaced a nullish one, or the two nullish values equality merges.
    return false
  }
  if (typeof value !== 'object' || typeof snapshot !== 'object') {
    return true
  }

  // Equality accepted a cyclic pair by assuming it matches; the walk does the
  // same, and a real difference is reported by the entry that opened the cycle.
  const pairs = visited.get(value) ?? new WeakSet()
  if (pairs.has(snapshot)) {
    return true
  }
  pairs.add(snapshot)
  visited.set(value, pairs)

  if (Array.isArray(value) && Array.isArray(snapshot)) {
    if (value.length !== snapshot.length) {
      return false
    }
    for (let index = 0; index < value.length; index++) {
      // Array iteration helpers skip holes, so index presence is compared
      // explicitly: a hole reads like an own `undefined` but is not one.
      if (Object.hasOwn(value, index) !== Object.hasOwn(snapshot, index)
        || !nullishValuesMatch(value[index], snapshot[index], visited)) {
        return false
      }
    }
    return true
  }
  if (value instanceof Map && snapshot instanceof Map) {
    for (const [key, child] of value) {
      if (!snapshot.has(key) || !nullishValuesMatch(child, snapshot.get(key), visited)) {
        return false
      }
    }
    return true
  }
  if (isPlainObject(value) && isPlainObject(snapshot)) {
    // Key presence is left to equality, which compares both key sets.
    return Object.keys(value).every(key => nullishValuesMatch(value[key], snapshot[key], visited))
  }
  return true
}

/** Recover copied transport subtrees while preserving new fields and explicit nullish values. */
function restoreApplicationValues(value: any, previous: MutationItemSnapshot[]): any {
  const matching = value != null && previous.find(candidate => fieldValuesEqual(value, candidate.transportSnapshot)
    && nullishValuesMatch(value, candidate.transportSnapshot))
  if (matching) {
    return matching.optimisticItem
  }
  /** Restore one field against corresponding fields from all prior items. */
  const restoreChild = (child: any, key: string | number) => restoreApplicationValues(child, previous.map(candidate => ({
    optimisticItem: candidate.optimisticItem?.[key],
    transportSnapshot: candidate.transportSnapshot?.[key],
  })))
  if (Array.isArray(value)) {
    return value.map(restoreChild)
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, restoreChild(child, key)]))
  }
  return value
}

/** Prepare a replacement batch, recovering copied wire fields even after reordering and rekeying. */
export function prepareMutationItems<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
>(
  store: StoreCore<TSchema, TCollectionDefaults>,
  collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>,
  items: Array<Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>>,
  previous: MutationItemSnapshot[] = [],
) {
  return items.map((item, index) => {
    const key = collection.getKey(item)
    const preferred = previous.find(candidate => collection.getKey(candidate.optimisticItem as any) === key) ?? previous[index]
    // Prefer this item's baseline when available. Other baselines recover copied
    // fields when the replacement changed both item position and primary key.
    const candidates = preferred ? [preferred, ...previous.filter(candidate => candidate !== preferred)] : previous
    return prepareMutationItem(store, collection, item, candidates.length ? candidates : undefined)
  })
}

/** Whether a value is a record whose fields can be reconciled independently. */
function isPlainObject(value: any): value is Record<string, any> {
  return value != null && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

/** Replace a hook payload in place so callbacks retain its original reference. */
export function replaceTransportItem(target: Record<string, any>, source: Record<string, any>) {
  for (const key of Object.keys(target)) {
    delete target[key]
  }
  Object.assign(target, source)
}
