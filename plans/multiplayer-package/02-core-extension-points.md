# 02: Core extension points

Target: `@rstore/shared`, `@rstore/core` and `@rstore/vue` know nothing about clocks, timestamps, tombstones or text. Every behaviour removed from them must be rebuildable by a plugin through the points below. S3 proves this with parity suites.

The points below are generic. Each has at least one non-multiplayer use, listed under it.

## A. Opaque write metadata

```ts
// packages/shared/src/types/cache.ts
/**
 * Per-write data forwarded untouched from mutations and connectors to cache
 * hooks. Core never reads it. Plugins augment this interface.
 */
export interface CustomCacheWriteMetadata {}

export interface Cache<TCollection> {
  writeItem: <TCollection extends Collection = Collection>(params: {
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    key: string | number
    item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
    marker?: string
    fromWriteItems?: boolean
    meta?: CustomHookMeta
    /** Opaque per-write data for cache hooks (see `cacheBeforeWriteItem`). */
    metadata?: CustomCacheWriteMetadata
  }) => void

  deleteItem: <TCollection extends Collection = Collection>(params: {
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    key: string | number
    metadata?: CustomCacheWriteMetadata
  }) => void

  writeItems: <TCollection extends Collection = Collection>(params: {
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    items: Array<WriteItem<TCollection, TCollectionDefaults, TSchema>> // WriteItem gains `metadata?`
    marker?: string
    meta?: CustomHookMeta
  }) => void
  // …
}

// packages/shared/src/types/mutation.ts
export interface ApplyMutationOptions<TCollection> {
  // … existing fields, minus fieldTimestamps / deletedAt
  /** Forwarded to every cache write/delete this mutation produces. */
  metadata?: CustomCacheWriteMetadata
}
```

```ts
// packages/multiplayer/src/lww/augment.ts
import type { FieldTimestamps, FieldTimestampValue } from '../clock/types'

declare module '@rstore/shared' {
  export interface CustomCacheWriteMetadata {
    /** Per-field HLC stamps for LWW merge. */
    fieldTimestamps?: FieldTimestamps
    /** Causal time of a delete; records a tombstone. */
    deletedAt?: FieldTimestampValue
  }
}
```

- **Core changes.** `createSingleApplyOptions`/`createManyApplyOptions` (`core/src/mutation/finalize/helpers.ts`) forward `options.metadata` instead of the two named fields.
- **Vue changes.** `cache/mutations.ts` and `queue.ts` thread `metadata` through `writeItem`/`writeItems`/`deleteItem`. Today `writeItems` drops `fieldTimestamps` entirely: only the single-write branch forwards it (`cache/mutations.ts:44-58`). Per-item `metadata` on `WriteItem` closes that gap.
- **Non-multiplayer uses.** ETag/`version` columns for optimistic concurrency, source tags (`{ source: 'realtime' }`) for analytics, connector-specific provenance.

## B. Write and delete interception hooks

Both hooks are synchronous. They run inside the queued flush (`queue.ts#processQueuedWriteItem`, `processQueuedWriteItems`, `processQueuedDelete`), so `pause()`/`resume()` and staggering keep their ordering. Both see the committed base row, without optimistic layers.

```ts
// packages/shared/src/types/hooks/cache.ts
export interface CacheHookDefinitions<TSchema extends StoreSchema, TCollectionDefaults extends CollectionDefaults> {
  /**
   * Called before a non-relation write reaches the committed cache state.
   * Handlers may replace the row that will be stored or drop the write.
   * Runs for single writes, `writeItems`, mutation results and relation children.
   */
  cacheBeforeWriteItem: <TCollection extends Collection>(payload: {
    store: GlobalStoreType
    meta: CustomHookMeta
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    key: string | number
    /** Committed row before this write, if any (frozen snapshot; do not mutate). */
    existing: Readonly<Record<string, any>> | undefined
    /** Incoming scalar fields (relation fields already split off). */
    incoming: Readonly<Record<string, any>>
    metadata: CustomCacheWriteMetadata | undefined
    /** Replace the row that will be stored. Indexes are updated from it. */
    setValue: (value: Record<string, any>) => void
    /** Drop the write: no state change, no `afterCacheWrite`. */
    skip: () => void
    /** Mark metadata keys as consumed (see D). */
    consume: (...keys: Array<keyof CustomCacheWriteMetadata>) => void
  }) => void

  /**
   * Called before an item is deleted from the committed cache state.
   */
  cacheBeforeDeleteItem: <TCollection extends Collection>(payload: {
    store: GlobalStoreType
    meta: CustomHookMeta
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    key: string | number
    existing: Readonly<Record<string, any>> | undefined
    metadata: CustomCacheWriteMetadata | undefined
    skip: () => void
    consume: (...keys: Array<keyof CustomCacheWriteMetadata>) => void
  }) => void
}
```

The new vue write path keeps today's order:

```ts
// packages/vue/src/cache/writes.ts (sketch)
/** Write an item, letting `cacheBeforeWriteItem` handlers replace or drop it. */
export function writeItemNow(ctx: CacheRuntime, params: WriteItemParams & { batch?: CacheWriteBatch }) {
  const collectionState = ensureCollectionRef(ctx, params.collection.name).value
  const { data, relationFields } = splitRelationFields(params) // existing writeMutableItem logic
  const existing = unwrapRow(collectionState[params.key])
  const decision = runBeforeWrite(ctx, params, existing, data) // { skipped, value }
  if (decision.skipped)
    return
  // Relation children are written only when the parent write survives, matching
  // today's early return on a losing tombstone check.
  writeRelationFields(ctx, params, relationFields)
  storeRow(ctx, params, collectionState, existing, decision.value ?? { ...existing, ...data })
  // marker, $queryTracking and afterCacheWrite: unchanged
}
```

- **Frozen items.** Today `Object.isFrozen(item)` writes bypass the LWW merge (`writes.ts:76`). With hooks they still bypass the merge: frozen rows go straight to the state. But the hook is called with `incoming` = the frozen row, and `setValue` is honoured. This fixes the silent bypass.
- **Fast path.** When no handler is registered (`store.$hooks.hasHook`, to add to `Hookable` if missing), the payload object is not allocated. Gate: the `vue/benchmark/publicationStore.ts` regression stays under 3% ([06](./06-slices.md)).
- **Non-multiplayer uses.**
  - Field-level server precedence, for example "never let a list response overwrite a detail-only field".
  - Version-column guards that drop stale writes (`if (incoming.version < existing.version) skip()`).
  - Redaction.

## C. Namespaced item metadata store

This replaces `state.fieldTimestamps`, the tombstone store, `readFieldTimestamps`/`writeFieldTimestamps` and `tombstones`/`gcTombstones`.

```ts
// packages/shared/src/types/cache.ts
/** Lifecycle of a metadata namespace relative to the item it describes. */
export type CacheItemMetadataLifecycle
  /** Removed with the item: delete, eviction, GC, clear, clearCollection. */
  = | 'item'
  /** Survives item deletion; removed only by clear/clearCollection or explicitly. */
    | 'detached'

export interface CacheItemMetadataNamespaceOptions {
  lifecycle: CacheItemMetadataLifecycle
  /** Include in `getState()` / restore in `setState()`. Values must be JSON/devalue-safe. @default true */
  serialize?: boolean
}

/** Per-item plugin data stored beside cache rows, partitioned by namespace. */
export interface CacheItemMetadata {
  /** Declare a namespace once (plugin setup). Re-registering with other options throws. */
  register: (namespace: string, options: CacheItemMetadataNamespaceOptions) => void
  read: <T = unknown>(namespace: string, collection: string, key: string | number) => T | undefined
  write: <T = unknown>(namespace: string, collection: string, key: string | number, value: T) => void
  delete: (namespace: string, collection: string, key: string | number) => void
  /** Iterate one namespace, optionally one collection. */
  entries: <T = unknown>(namespace: string, collection?: string) => IterableIterator<{ collection: string, key: string | number, value: T }>
  size: (namespace: string) => number
}

export interface Cache<TCollection> {
  itemMetadata: CacheItemMetadata
}

export interface CustomCacheState {
  /** namespace → collection → key → value. Present only for `serialize` namespaces. */
  itemMetadata?: Record<string, Record<string, Record<string | number, unknown>>>
}
```

- **Vue implementation.** One `Map<namespace, Map<collection, Map<key, value>>>` in `CacheRuntime.state`. It is non-reactive, like `fieldTimestamps` today.
- **Clean-up.** `deleteItemNow`, eviction, `clearNow` and `clearCollection` drop `item` namespaces for the key or collection. `clearNow`/`clearCollection` also drop `detached` namespaces.
- **Numeric keys.** `restoreCausality` becomes `restoreItemMetadata`. It is generic and keeps the numeric-key restoration that `hydration.ts` does today (object keys arrive as strings; the row's `getKey` recovers numbers).
- **Writes are synchronous.** They are not queued: hooks call them from inside the flush.
- **Non-multiplayer uses.** Per-item `etag`, last-fetched-at per row (a TTL fetch policy), connector cursors and offline sync state.

Multiplayer namespaces:

| Namespace | Lifecycle | Value |
|---|---|---|
| `multiplayer:fields` | `item` | `FieldTimestamps` |
| `multiplayer:tombstone` | `detached` | `{ deletedAt: FieldTimestampValue }` |
| `multiplayer:ot` | `item` | `{ docId, version }` for OT node rows ([04](./04-rich-text-ot.md)) |

## D. Unconsumed-metadata warning

In dev builds, after the hooks run, vue warns once per key: `[rstore] cache write metadata "fieldTimestamps" for collection "todos" was not handled by any plugin`.

This catches the main risk of the move: an app with realtime stamps but without the plugin silently degrades to overwrite-and-resurrect. Handlers call `consume()` for the keys they handled.

## E. Form field merge hook

`@rstore/vue` forms keep `$rebase`, `$conflicts`, `$resolveConflict` and `$onConflict`. Only the merge policy leaves.

```ts
// packages/shared/src/types/hooks/form.ts (new group)
export interface FormHookDefinitions<TSchema extends StoreSchema, TCollectionDefaults extends CollectionDefaults> {
  /**
   * Called during `$rebase` for every field changed both locally and remotely,
   * and for each local `set` operation on that field when the op log is rewritten.
   * The first handler that calls `setMerged` wins; with none, the field conflicts.
   */
  formFieldMerge: <TCollection extends Collection>(payload: {
    store: GlobalStoreType
    collection?: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    field: string
    base: unknown
    local: unknown
    remote: unknown
    setMerged: (value: unknown) => void
  }) => void
}

// packages/shared/src/types/form.ts
export interface FormFieldConflict {
  field: string
  localValue: unknown
  remoteValue: unknown
}
```

- **Vue changes.** `form/rebase.ts` replaces both `mergeText` calls with a local `mergeField(ctx, field, base, local, remote)`. It calls the hook and returns `{ merged } | { conflict }`. `diffFields` is imported from core `utils`.
- **Standalone forms.** Forms created without a store (`createFormObject`) get an optional `fieldMerge` option with the same signature.
- **Multiplayer handler.** `textFieldMerger` merges only when all three values are strings and `mergeText(...).conflicts.length === 0`.

## F. Dispose hook

```ts
// packages/shared/src/types/hooks/lifecycle.ts
export interface LifecycleHookDefinitions<TCollection> {
  /** Called once when the store's cache is disposed (`$cache.dispose()`). */
  dispose: (payload: { store: GlobalStoreType }) => void
}
```

The tombstone GC timer and the presence and OT channels stop here. `cache.dispose()` keeps its current idempotence.

## What core does **not** get

- **No global mutation history.** Forms keep their op log; OT keeps its own op log ([04](./04-rich-text-ot.md)).
  - Multiplayer needs "local mutation history" only to stamp commits.
  - `beforeMutation`/`afterMutation` already give that. They gain `metadata` and `setMetadata(patch)`, so a plugin can attach stamps that finalize forwards to the cache (A).
- **No merge-strategy registry, no conflict type in the cache contract.** `cacheConflict` becomes a multiplayer-defined hook, through `HookDefinitions` augmentation.
- **No clock abstraction.** Ordering is plugin data.

## What leaves `@rstore/shared`

| Item | 0.9.0 | 0.10.0 |
|---|---|---|
| `types/crdt.ts` (all 7 types) | Stays as the source. `@deprecated` JSDoc points to `@rstore/multiplayer`, which re-exports it | Definitions move to `multiplayer/src/{clock,lww,text}/types.ts`; file deleted |
| `types/multiplayer.ts`, `utils/multiplayer.ts` | Same pattern | Moved to `multiplayer/src/protocol/` |
| `CacheTombstone`, `CacheTombstones` | Removed (replaced by C) | — |
| `Cache.readFieldTimestamps`, `writeFieldTimestamps`, `tombstones`, `gcTombstones` | Removed (C); multiplayer exposes `getFieldTimestamps(store, …)`, `getTombstone(store, …)` and `gcTombstones(store, cutoff)` helpers | — |
| `Cache.writeItem.fieldTimestamps`, `deleteItem.deletedAt`, `ApplyMutationOptions.fieldTimestamps/deletedAt` | Accepted as `@deprecated` aliases, mapped to `metadata` by `vue/src/cache/deprecatedAliases.ts` | Removed |
| `CacheHookDefinitions.cacheConflict` | Removed from shared; declared by multiplayer augmentation | — |
| `FieldConflict` in forms | `FormFieldConflict` | — |
| `CustomCacheState.fieldTimestamps/tombstones` (vue augmentation) | Removed. The SSR payload is produced and consumed by the same build, so no compatibility is needed | — |

The type-source inversion in 0.9 avoids both a dependency cycle (shared ↔ multiplayer) and duplicated type definitions ([05](./05-migration.md)).
