/** Cache metadata containing per-query exclusions from computed results. */
interface DirtyQueryMetadata {
  /** Query ids that must not display this row. */
  dirtyQueries: Set<unknown>
}

/**
 * Remember exclusions after a page releases a row, without owning its metadata.
 * Another query can keep the row alive and evict it later; neither its metadata
 * nor an ever-growing list of dead WeakRefs should survive that eviction.
 */
export class DirtyQueryMemberships {
  /** Weak handles enumerable when the query ends or disables tracking. */
  private readonly references = new Set<WeakRef<DirtyQueryMetadata>>()
  /** Deduplicate handles when several pages release the same metadata. */
  private readonly entries = new WeakMap<DirtyQueryMetadata, WeakRef<DirtyQueryMetadata>>()
  /** Drop handles once their metadata dies, without retaining the metadata. */
  private readonly collected = new FinalizationRegistry<WeakRef<DirtyQueryMetadata>>((entry) => {
    this.references.delete(entry)
  })

  /** Bind exclusions to one logical query id. */
  constructor(private readonly queryId: string) {}

  /** Exclude a released row until it is retained again or the query ends. */
  add(metadata: DirtyQueryMetadata): void {
    metadata.dirtyQueries.add(this.queryId)
    if (this.entries.has(metadata))
      return
    const entry = new WeakRef(metadata)
    this.entries.set(metadata, entry)
    this.references.add(entry)
    this.collected.register(metadata, entry, entry)
  }

  /** Remove only this query's exclusion when it retains a row again. */
  delete(metadata: DirtyQueryMetadata): void {
    metadata.dirtyQueries.delete(this.queryId)
    const entry = this.entries.get(metadata)
    if (entry) {
      this.entries.delete(metadata)
      this.references.delete(entry)
      this.collected.unregister(entry)
    }
  }

  /** Release current and historical exclusions, preserving other queries' ids. */
  clear(): void {
    for (const entry of this.references) {
      const metadata = entry.deref()
      if (metadata) {
        metadata.dirtyQueries.delete(this.queryId)
        this.entries.delete(metadata)
      }
      this.collected.unregister(entry)
    }
    this.references.clear()
  }
}
