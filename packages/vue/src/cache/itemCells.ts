import type { EngineChangeSet } from '@rstore/core'
import type { Ref, ShallowRef } from 'vue'
import type { CacheChangeInterestRegistry } from './changeInterest'
import type { ResolvedItemChanges } from './stateSink'
import { shallowRef, triggerRef } from 'vue'
import { appendSyncError, throwSyncErrors } from './syncErrors'

/** One wrapper-owned reactive source with detached lazy-read fallback. */
export interface ItemCell {
  /** Ref-shaped source consumed by wrapped-item proxy. */
  source: Ref<any>
  /** Track exact active cell without reading engine state twice. */
  track: () => void
  /** Return whether committed engine changes synchronize this cell. */
  isActive: () => boolean
  /** Stop registry retention while keeping external wrapper usable. */
  detach: () => void
}

/** Registry synchronizing active wrapper cells from engine change sets. */
export interface ItemCellRegistry {
  /** Create and retain one wrapper-specific item source. */
  create: (collection: string, key: string | number, initial: any, active?: boolean) => ItemCell
  /** Resolve changed engine items once and update every active wrapper cell. */
  flush: (changes: EngineChangeSet, values?: ResolvedItemChanges) => void
  /** Apply one Core-provided resolved value without aggregate containers. */
  flushItem: (collection: string, key: string, value: unknown) => void
  /** Detach every active cell. */
  dispose: () => void
}

/** Dependencies required by detached lazy reads and committed synchronization. */
export interface CreateItemCellRegistryOptions {
  /** Read current resolved engine value. */
  read: (collection: string, key: string | number) => any | undefined
  /** Track collection fallback used only by detached cells. */
  trackFallback: (collection: string, key: string | number) => void
  /** Register exact active item dependencies with Core. */
  interest: CacheChangeInterestRegistry
}

/** Create wrapper-owned cells indexed by canonical collection and item id. */
export function createItemCellRegistry(options: CreateItemCellRegistryOptions): ItemCellRegistry {
  const registry = new CacheItemCellRegistry(options)
  return {
    create: registry.create.bind(registry),
    flush: registry.flush.bind(registry),
    flushItem: registry.flushItem.bind(registry),
    dispose: registry.dispose.bind(registry),
  }
}

/** Compact registry shared by every item cell. */
class CacheItemCellRegistry implements ItemCellRegistry {
  /** Active cells grouped by collection and canonical key. */
  private readonly collections = new Map<string, Map<string, Set<CacheItemCell>>>()
  /** Whether cache disposal severed runtime ownership. */
  private disposed = false

  /** Create registry with engine-read and interest callbacks. */
  constructor(private readonly options: CreateItemCellRegistryOptions) {}

  /** Create one dormant or immediately active wrapper source. */
  create(collection: string, key: string | number, initial: any, active = false): ItemCell {
    const cell = new CacheItemCell(this, collection, String(key), initial, this.disposed ? 'detached' : 'dormant')
    if (active && !this.disposed)
      this.register(cell)
    return cell
  }

  /** Activate one lazy cell from current engine state. */
  activate(cell: CacheItemCell): boolean {
    if (this.disposed || cell.state !== 'dormant')
      return false
    const current = this.options.read(cell.collection, cell.id)
    if (current !== undefined)
      cell.update(current)
    this.register(cell)
    return true
  }

  /** Resolve one detached value while registering broad fallback tracking. */
  readFallback(cell: CacheItemCell): any {
    this.options.trackFallback(cell.collection, cell.id)
    return this.options.read(cell.collection, cell.id) ?? cell.fallback
  }

  /** Synchronize every active changed cell with at most one engine read. */
  flush(changes: EngineChangeSet, values?: ResolvedItemChanges): void {
    if (this.disposed || !this.collections.size)
      return
    let errors: unknown[] | undefined
    for (const [collection, keys] of changes.items) {
      const byKey = this.collections.get(collection)
      if (!byKey)
        continue
      for (const key of keys) {
        const cells = byKey.get(key)
        if (!cells?.size)
          continue
        try {
          const resolved = values?.get(collection)
          const next = resolved?.has(key) ? resolved.get(key) : this.options.read(collection, key)
          this.updateCells(collection, key, cells, next)
        }
        catch (error) {
          errors = appendSyncError(errors, error)
        }
      }
    }
    throwSyncErrors(errors, 'Item cell synchronization failed')
  }

  /** Synchronize one exact key through scalar state-sink dispatch. */
  flushItem(collection: string, key: string, value: unknown): void {
    const cells = this.collections.get(collection)?.get(key)
    if (cells?.size)
      this.updateCells(collection, key, cells, value)
  }

  /** Remove one cell while preserving detached wrapper reads. */
  detach(cell: CacheItemCell): void {
    if (cell.state === 'detached')
      return
    const wasActive = cell.state === 'active'
    cell.state = 'detached'
    const byKey = this.collections.get(cell.collection)
    const cells = byKey?.get(cell.id)
    cells?.delete(cell)
    if (cells && !cells.size)
      byKey?.delete(cell.id)
    if (byKey && !byKey.size)
      this.collections.delete(cell.collection)
    if (wasActive)
      this.options.interest.releaseItem(cell.collection, cell.id)
    if (wasActive)
      triggerRef(cell.ref)
  }

  /** Release active cells and sever retained wrappers from cache runtime. */
  dispose(): void {
    if (this.disposed)
      return
    this.disposed = true
    for (const [collection, byKey] of this.collections) {
      for (const [id, cells] of byKey) {
        for (const cell of cells) {
          cell.state = 'detached'
          cell.registry = undefined
          this.options.interest.releaseItem(collection, id)
        }
      }
    }
    this.collections.clear()
  }

  /** Register one current cell and its exact Core interest. */
  private register(cell: CacheItemCell): void {
    cell.state = 'active'
    const byKey = this.collections.get(cell.collection) ?? new Map<string, Set<CacheItemCell>>()
    this.collections.set(cell.collection, byKey)
    const cells = byKey.get(cell.id) ?? new Set<CacheItemCell>()
    byKey.set(cell.id, cells)
    cells.add(cell)
    this.options.interest.retainItem(cell.collection, cell.id)
  }

  /** Apply one resolved value to all active wrappers for a canonical key. */
  private updateCells(collection: string, key: string, cells: Set<CacheItemCell>, next: unknown): void {
    let errors: unknown[] | undefined
    for (const cell of cells) {
      try {
        if (next === undefined)
          this.detach(cell)
        else cell.update(next)
      }
      catch (error) {
        errors = appendSyncError(errors, error)
      }
    }
    throwSyncErrors(errors, `Item cell synchronization failed for ${collection}:${key}`)
  }
}

/** Prototype-backed item source avoiding wrapper-specific reader closures. */
class CacheItemCell implements ItemCell {
  /** Vue dependency updated after engine commits. */
  readonly ref: ShallowRef<any>
  /** Last readable value retained after detachment or deletion. */
  fallback: any
  /** Shared state-specific reader selected outside hot field reads. */
  private reader: ItemCellReader
  /** Lazy, synchronized, or detached state. */
  private currentState: ItemCellState

  /** Create one compact source. */
  constructor(
    /** Owning registry, removed on complete disposal. */
    public registry: CacheItemCellRegistry | undefined,
    /** Owning collection. */
    public readonly collection: string,
    /** Canonical item key. */
    public readonly id: string,
    initial: any,
    state: ItemCellState,
  ) {
    this.ref = shallowRef(initial)
    this.fallback = initial
    this.currentState = state
    this.reader = state === 'active' ? () => this.ref.value : readerForInactiveState(state)
  }

  /** Return lazy, synchronized, or detached state. */
  get state(): ItemCellState {
    return this.currentState
  }

  /** Select shared reader during lifecycle transitions. */
  set state(value: ItemCellState) {
    this.currentState = value
    this.reader = value === 'active' ? () => this.ref.value : readerForInactiveState(value)
  }

  /** Expose this prototype-backed source through Ref API. */
  get source(): Ref<any> {
    return this as unknown as Ref<any>
  }

  /** Read active value or lazily enter fallback/active ownership. */
  get value(): any {
    return this.reader(this)
  }

  /** Support Ref-shaped writes inside Vue utilities. */
  set value(next: any) {
    this.update(next)
  }

  /** Consume reactive dependency for an already requested wrapper. */
  track(): void {
    // eslint-disable-next-line ts/no-unused-expressions
    this.value
  }

  /** Return whether committed engine changes synchronize this cell. */
  isActive(): boolean {
    return this.state === 'active'
  }

  /** Stop registry ownership while preserving lazy reads. */
  detach(): void {
    this.registry?.detach(this)
  }

  /** Store one current value and notify reactive consumers. */
  update(next: any): void {
    this.fallback = next
    this.ref.value = next
  }
}

/** Item-cell lifecycle state. */
type ItemCellState = 'dormant' | 'active' | 'detached'

/** Shared source reader signature. */
type ItemCellReader = (cell: CacheItemCell) => any

/** Activate a lazy wrapper or fall back to detached lookup. */
function readDormant(cell: CacheItemCell): any {
  if (cell.registry?.activate(cell))
    return cell.ref.value
  return cell.registry?.readFallback(cell) ?? cell.fallback
}

/** Read current engine value for an evicted wrapper when runtime remains live. */
function readDetached(cell: CacheItemCell): any {
  return cell.registry?.readFallback(cell) ?? cell.fallback
}

/** Return shared reader for one inactive lifecycle state. */
function readerForInactiveState(state: Exclude<ItemCellState, 'active'>): ItemCellReader {
  return state === 'dormant' ? readDormant : readDetached
}
