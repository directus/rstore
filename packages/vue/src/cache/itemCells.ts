import type { EngineChangeSet } from '@rstore/core'
import type { Ref, ShallowRef } from 'vue'
import type { CacheChangeInterestRegistry } from './changeInterest'
import { shallowRef, triggerRef } from 'vue'
import { appendSyncError, throwSyncErrors } from './syncErrors'

/** One wrapper-owned reactive source with detached lazy-read fallback. */
export interface ItemCell {
  /** Ref-shaped source consumed by wrapped-item proxy. */
  source: Ref<any>
  /** Track exact active cell without reading engine state. */
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
  flush: (changes: EngineChangeSet) => void
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
  const collections = new Map<string, Map<string, Set<InternalItemCell>>>()
  let disposed = false

  /** Create one cell and register its exact wrapper identity. */
  function create(collection: string, key: string | number, initial: any, active = false): ItemCell {
    const id = String(key)
    const value = shallowRef(initial)
    const cell: InternalItemCell = {
      value,
      fallback: initial,
      state: disposed ? 'detached' : 'dormant',
      source: undefined as unknown as Ref<any>,
      track() {
        // eslint-disable-next-line ts/no-unused-expressions
        cell.source.value
      },
      isActive: () => cell.state === 'active',
      detach() {
        detachCell(collection, id, cell)
      },
    }
    cell.source = {
      get value() {
        if (cell.state === 'active')
          return value.value
        if (cell.state === 'dormant' && activateCell(collection, id, cell))
          return value.value
        options.trackFallback(collection, id)
        return options.read(collection, id) ?? cell.fallback
      },
    } as Ref<any>
    if (active && !disposed)
      registerCell(collection, id, cell)
    return cell
  }

  /** Activate one lazy wrapper from current engine state. */
  function activateCell(collection: string, id: string, cell: InternalItemCell): boolean {
    if (disposed || cell.state !== 'dormant')
      return false
    const current = options.read(collection, id)
    if (current !== undefined) {
      cell.fallback = current
      cell.value.value = current
    }
    registerCell(collection, id, cell)
    return true
  }

  /** Register one current cell and its exact Core interest. */
  function registerCell(collection: string, id: string, cell: InternalItemCell): void {
    cell.state = 'active'
    const byKey = collections.get(collection) ?? new Map<string, Set<InternalItemCell>>()
    collections.set(collection, byKey)
    const cells = byKey.get(id) ?? new Set<InternalItemCell>()
    byKey.set(id, cells)
    cells.add(cell)
    options.interest.retainItem(collection, id)
  }

  /** Synchronize each changed key with one engine read. */
  function flush(changes: EngineChangeSet): void {
    if (disposed || !collections.size)
      return
    let errors: unknown[] | undefined
    for (const [collection, keys] of changes.items) {
      const byKey = collections.get(collection)
      if (!byKey)
        continue
      for (const key of keys) {
        const cells = byKey.get(key)
        if (!cells?.size)
          continue
        let next: any
        try {
          next = options.read(collection, key)
        }
        catch (error) {
          errors = appendSyncError(errors, error)
          continue
        }
        for (const cell of cells) {
          try {
            if (next === undefined) {
              // Switch dependency ownership before notifying. One rerun then
              // sees lazy engine state while retained wrappers keep fallback.
              cell.detach()
            }
            else {
              cell.fallback = next
              cell.value.value = next
            }
          }
          catch (error) {
            errors = appendSyncError(errors, error)
          }
        }
      }
    }
    throwSyncErrors(errors, 'Item cell synchronization failed')
  }

  /** Remove one cell without invalidating external wrapper references. */
  function detachCell(collection: string, id: string, cell: InternalItemCell): void {
    if (cell.state === 'detached')
      return
    const wasActive = cell.state === 'active'
    cell.state = 'detached'
    const byKey = collections.get(collection)
    const cells = byKey?.get(id)
    cells?.delete(cell)
    if (cells && !cells.size)
      byKey?.delete(id)
    if (byKey && !byKey.size)
      collections.delete(collection)
    if (wasActive)
      options.interest.releaseItem(collection, id)
    // Existing external wrapper readers must rerun once in detached mode so
    // they acquire collection fallback tracking for later reinsertion/reset.
    if (wasActive)
      triggerRef(cell.value)
  }

  /** Detach all cells and release registry ownership. */
  function dispose(): void {
    if (disposed)
      return
    disposed = true
    for (const [collection, byKey] of collections) {
      for (const [id, cells] of byKey) {
        for (const cell of cells) {
          cell.state = 'detached'
          options.interest.releaseItem(collection, id)
        }
      }
    }
    collections.clear()
  }

  return { create, flush, dispose }
}

/** Mutable cell state hidden from cache consumers. */
interface InternalItemCell extends ItemCell {
  /** Vue cell updated after engine commits. */
  value: ShallowRef<any>
  /** Last readable value retained after detachment or deletion. */
  fallback: any
  /** Lazy, actively synchronized, or externally retained detached state. */
  state: 'dormant' | 'active' | 'detached'
}
