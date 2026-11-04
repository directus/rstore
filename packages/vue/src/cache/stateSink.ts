import type { EngineChangeSet, EngineStateChangeSink } from '@rstore/core'
import type { CacheChangeInterestRegistry } from './changeInterest'

const EMPTY_VALUES: ResolvedItemChanges = new Map()
const EMPTY_RESETS: ReadonlySet<string> = new Set()

/** Final resolved values buffered beside compact dependency invalidations. */
export type ResolvedItemChanges = ReadonlyMap<string, ReadonlyMap<string, unknown>>

/** Rare public-key representation changes requiring wrapper eviction. */
export interface ItemKeyFormChange {
  /** Owning collection. */
  collection: string
  /** Canonical internal key. */
  id: string
  /** Previous public key representation. */
  previousKey: string | number
  /** Current public key representation. */
  key: string | number
}

/** Deleted wrapper identity recorded without rescanning ordinary item changes. */
export interface DeletedItemIdentity {
  /** Owning collection. */
  collection: string
  /** Canonical key. */
  key: string
}

/** Dependencies required by the compact Core state sink. */
export interface CreateCacheStateSinkOptions {
  /** Live Vue and result-cache interests. */
  interest: CacheChangeInterestRegistry
  /** Publish one committed operation into bridge registries. */
  flush: (
    changes: EngineChangeSet,
    values: ResolvedItemChanges,
    keyForms: readonly ItemKeyFormChange[],
    resets: ReadonlySet<string>,
    deletions: readonly DeletedItemIdentity[],
  ) => void
  /** Publish common one-item operations without aggregate containers. */
  flushItem: (
    collection: string,
    key: string,
    value: unknown,
    keyForm?: { previousKey: string | number, key: string | number },
  ) => void
  /** Publish common one-index operations without aggregate containers. */
  flushIndex: (dependency: string) => void
}

/** Create one reusable operation buffer consumed synchronously by Core. */
export function createCacheStateSink(options: CreateCacheStateSinkOptions): EngineStateChangeSink {
  const changes: MutableChanges = { items: new Map(), lists: new Set(), indexes: new Set() }
  const itemKeyPool = new Map<string, Set<string>>()
  const itemValuePool = new Map<string, Map<string, unknown>>()
  const values = new Map<string, Map<string, unknown>>()
  let changed = false
  let keyForms: ItemKeyFormChange[] | undefined
  let resets: Set<string> | undefined
  let deletions: DeletedItemIdentity[] | undefined
  let hasSingleItem = false
  let singleCollection = ''
  let singleKey = ''
  let singleValue: unknown
  let singleKeyForm: { previousKey: string | number, key: string | number } | undefined
  let hasSingleIndex = false
  let singleIndex = ''

  /** Promote scalar state and allocate aggregate containers after another dependency. */
  function ensureChanges(): MutableChanges {
    changed = true
    if (hasSingleItem) {
      const collection = singleCollection
      const key = singleKey
      const value = singleValue
      const keyForm = singleKeyForm
      clearSingleItem()
      addItemToChanges(collection, key, value, keyForm)
    }
    if (hasSingleIndex) {
      const dependency = singleIndex
      clearSingleIndex()
      changes.indexes.add(dependency)
    }
    return changes
  }

  /** Add one item to aggregate dependency and resolved-value containers. */
  function addItemToChanges(
    collection: string,
    key: string,
    value: unknown,
    keyFormChange?: { previousKey: string | number, key: string | number },
  ): void {
    const itemChanges = ensureChanges()
    const keys = itemChanges.items.get(collection) ?? itemKeyPool.get(collection) ?? new Set<string>()
    itemKeyPool.set(collection, keys)
    itemChanges.items.set(collection, keys)
    keys.add(key)
    const byKey = values.get(collection) ?? itemValuePool.get(collection) ?? new Map<string, unknown>()
    itemValuePool.set(collection, byKey)
    values.set(collection, byKey)
    byKey.set(key, value)
    if (value === undefined) {
      deletions ??= []
      deletions.push({ collection, key })
    }
    if (keyFormChange) {
      keyForms ??= []
      keyForms.push({ collection, id: key, ...keyFormChange })
    }
  }

  /** Keep common one-item operations in scalar slots until commit. */
  function recordItem(
    collection: string,
    key: string,
    value: unknown,
    keyFormChange?: { previousKey: string | number, key: string | number },
  ): void {
    if (!changed) {
      changed = true
      hasSingleItem = true
      singleCollection = collection
      singleKey = key
      singleValue = value
      singleKeyForm = keyFormChange
      return
    }
    if (hasSingleItem && singleCollection === collection && singleKey === key) {
      singleValue = value
      singleKeyForm = keyFormChange ?? singleKeyForm
      return
    }
    ensureChanges()
    addItemToChanges(collection, key, value, keyFormChange)
  }

  /** Release scalar references after direct commit or failure. */
  function clearSingleItem(): void {
    hasSingleItem = false
    singleCollection = ''
    singleKey = ''
    singleValue = undefined
    singleKeyForm = undefined
  }

  /** Release one scalar index reference after direct commit or promotion. */
  function clearSingleIndex(): void {
    hasSingleIndex = false
    singleIndex = ''
  }

  /** Keep common one-index operations in scalar slots until commit. */
  function recordIndex(dependency: string): void {
    if (!changed) {
      changed = true
      hasSingleIndex = true
      singleIndex = dependency
      return
    }
    if (hasSingleIndex && singleIndex === dependency)
      return
    ensureChanges().indexes.add(dependency)
  }

  /** Record active dependencies for one reset without scanning engine keys. */
  function recordCollectionReset(collection: string): void {
    const itemInterest = options.interest.value.itemKeys.get(collection)
    const exactKeys = options.interest.exactItemKeys(collection)
    const listInterest = options.interest.wantsList(collection)
    const indexInterest = options.interest.value.indexes.get(collection)
    if (!itemInterest && !listInterest && !indexInterest?.size)
      return
    const resetChanges = ensureChanges()
    if (itemInterest) {
      const keys = itemKeyPool.get(collection) ?? new Set<string>()
      itemKeyPool.set(collection, keys)
      for (const key of exactKeys) keys.add(key)
      resetChanges.items.set(collection, keys)
    }
    if (listInterest)
      resetChanges.lists.add(collection)
    for (const dependency of indexInterest ?? []) resetChanges.indexes.add(dependency)
    resets ??= new Set()
    resets.add(collection)
  }

  /** Clear references after commit, failure, or an empty operation. */
  function discard(): void {
    if (!changed)
      return
    if (hasSingleItem || hasSingleIndex) {
      clearSingleItem()
      clearSingleIndex()
      changed = false
      return
    }
    clearSingleItem()
    clearSingleIndex()
    for (const keys of changes.items.values()) keys.clear()
    changes.items.clear()
    changes.lists.clear()
    changes.indexes.clear()
    for (const byKey of values.values()) byKey.clear()
    values.clear()
    keyForms = undefined
    resets = undefined
    deletions = undefined
    changed = false
  }

  return {
    begin() {
      discard()
      return options.interest.hasAny()
    },
    wantsItem: options.interest.wantsItem,
    wantsList: options.interest.wantsList,
    wantsIndex: options.interest.wantsIndex,
    recordItem,
    recordList(collection) {
      ensureChanges().lists.add(collection)
    },
    recordIndex,
    recordCollectionReset,
    commit() {
      if (!changed) {
        discard()
        return
      }
      try {
        if (hasSingleItem)
          options.flushItem(singleCollection, singleKey, singleValue, singleKeyForm)
        else if (hasSingleIndex)
          options.flushIndex(singleIndex)
        else options.flush(changes, values.size ? values : EMPTY_VALUES, keyForms ?? [], resets ?? EMPTY_RESETS, deletions ?? [])
      }
      finally {
        discard()
      }
    },
    discard,
  }
}

/** Mutable implementation hidden behind the readonly public change set. */
interface MutableChanges extends EngineChangeSet {
  /** Changed canonical keys grouped by collection. */
  items: Map<string, Set<string>>
  /** Changed visible-list dependencies. */
  lists: Set<string>
  /** Changed opaque index dependencies. */
  indexes: Set<string>
}
