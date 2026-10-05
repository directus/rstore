import type { EngineChangeSet } from '@rstore/core'
import type { Ref } from 'vue'
import type { CacheChangeInterestRegistry } from './changeInterest'
import type { ResolvedItemChanges } from './stateSink'
import { triggerRef } from 'vue'
import { CacheItemCell } from './itemCell'
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
  /** Stage live changed values until list and missing-item signals have published. */
  stage: (changes: EngineChangeSet, values?: ResolvedItemChanges) => StagedItemCellUpdates | undefined
  /** Apply one Core-provided resolved value without aggregate containers. */
  flushItem: (collection: string, key: string, value: unknown) => void
  /** Detach every active cell. */
  dispose: () => void
}

/** Live cell updates staged as one coherent source snapshot. */
export interface StagedItemCellUpdates {
  /** Notify every reactive wrapper after bridge signals observe staged values. */
  notify: () => void
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
    stage: registry.stage.bind(registry),
    flushItem: registry.flushItem.bind(registry),
    dispose: registry.dispose.bind(registry),
  }
}

/** Compact registry shared by every item cell. */
export class CacheItemCellRegistry implements ItemCellRegistry {
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

  /** Stage current non-deleted values before any dependent watcher can rerun. */
  stage(changes: EngineChangeSet, values?: ResolvedItemChanges): StagedItemCellUpdates | undefined {
    if (this.disposed || !this.collections.size)
      return undefined
    const updates: Array<{ cells: Set<CacheItemCell>, next: unknown }> = []
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
          // Callers only stage operations whose change set has no deletions.
          // Keep a defensive error here so a future caller cannot leave an
          // active wrapper reading a vanished value without detaching it.
          if (next === undefined)
            throw new Error(`Cannot stage deleted item cell ${collection}:${key}`)
          updates.push({ cells, next })
        }
        catch (error) {
          errors = appendSyncError(errors, error)
        }
      }
    }
    throwSyncErrors(errors, 'Item cell staging failed')
    const staged: CacheItemCell[] = []
    for (const { cells, next } of updates) {
      for (const cell of cells) {
        if (cell.stage(next))
          staged.push(cell)
      }
    }
    if (!staged.length)
      return undefined
    return {
      notify() {
        let notifyErrors: unknown[] | undefined
        for (const cell of staged) {
          try {
            cell.notify()
          }
          catch (error) {
            notifyErrors = appendSyncError(notifyErrors, error)
          }
        }
        throwSyncErrors(notifyErrors, 'Staged item cell notification failed')
      },
    }
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
