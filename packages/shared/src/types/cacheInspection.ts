/** Borrowed row; detach values before retaining or transporting them. */
export interface CacheInspectionRow {
  /** Public identity where known, otherwise canonical stored address. */
  readonly key: string | number
  /** Borrowed value; inspection consumers must not mutate it. */
  readonly value: unknown
  /** Diagnostic field bound omitted part of this row; consumers must expose truncation. */
  readonly truncated?: boolean
}

/** Lazy collection view resolved by the owning cache. */
export interface CacheInspectionCollection {
  /** Registered collection name. */
  readonly name: string
  /** Current committed row count. */
  readonly count: number
  /** Iterate committed rows without creating item wrappers. */
  rows: () => Iterable<CacheInspectionRow>
  /** Current visible row count with active overlays applied. */
  readonly effectiveCount: number
  /** Iterate visible rows using cache-owned layer resolution. */
  effectiveRows: () => Iterable<CacheInspectionRow>
}

/** Read-only diagnostic view of a single overlay, including skipped layers. */
export interface CacheInspectionLayer {
  /** Unique cache layer identifier. */
  readonly id: string
  /** Owning collection name. */
  readonly collectionName: string
  /** Whether this layer represents an optimistic operation. */
  readonly optimistic: boolean
  /** Whether this layer is excluded from visible cache values. */
  readonly skip: boolean
  /** Cache-owned prevention flags. */
  readonly prevent: Readonly<Partial<Record<'update' | 'delete', boolean>>>
  /** Iterate borrowed layer values. */
  rows: () => Iterable<CacheInspectionRow>
  /** Iterate keys deleted by this layer in their supplied representation. */
  deletedKeys: () => Iterable<string | number>
}

/** Cache-owned lazy readers; never transport this object directly. */
export interface CacheInspection {
  /** Registered committed collection views with separate visible views. */
  readonly collections: readonly CacheInspectionCollection[]
  /** Iterate currently registered layers. */
  layers: () => Iterable<CacheInspectionLayer>
  /** Read borrowed diagnostic state without query or connector execution. */
  metadata: () => unknown
}
