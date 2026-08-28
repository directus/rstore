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
      read: () => initial,
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
        return cell.read()
      },
    } as Ref<any>
    installDormantReader(collection, id, cell)
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
    setCellReader(cell, () => cell.value.value)
    const byKey = collections.get(collection) ?? new Map<string, Set<InternalItemCell>>()
    collections.set(collection, byKey)
    const cells = byKey.get(id) ?? new Set<InternalItemCell>()
    byKey.set(id, cells)
    cells.add(cell)
    options.interest.retainItem(collection, id)
  }

  /** Synchronize each changed key with one engine read. */
  function flush(changes: EngineChangeSet, values?: ResolvedItemChanges): void {
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
        try {
          const resolved = values?.get(collection)
          const next = resolved?.has(key) ? resolved.get(key) : options.read(collection, key)
          updateCells(collection, key, cells, next)
        }
        catch (error) {
          errors = appendSyncError(errors, error)
        }
      }
    }
    throwSyncErrors(errors, 'Item cell synchronization failed')
  }

  /** Synchronize one exact key through scalar state-sink dispatch. */
  function flushItem(collection: string, key: string, value: unknown): void {
    const cells = collections.get(collection)?.get(key)
    if (cells?.size)
      updateCells(collection, key, cells, value)
  }

  /** Apply one resolved value to all active wrappers for a canonical key. */
  function updateCells(collection: string, key: string, cells: Set<InternalItemCell>, next: unknown): void {
    let errors: unknown[] | undefined
    for (const cell of cells) {
      try {
        if (next === undefined) {
          // Switch ownership before notifying so reruns track reinsertion.
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
    throwSyncErrors(errors, `Item cell synchronization failed for ${collection}:${key}`)
  }

  /** Remove one cell without invalidating external wrapper references. */
  function detachCell(collection: string, id: string, cell: InternalItemCell): void {
    if (cell.state === 'detached')
      return
    const wasActive = cell.state === 'active'
    cell.state = 'detached'
    installDetachedReader(collection, id, cell)
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
          installDetachedReader(collection, id, cell)
          options.interest.releaseItem(collection, id)
        }
      }
    }
    collections.clear()
  }

  return { create, flush, flushItem, dispose }

  /** Install one-shot activation logic on a dormant wrapper source. */
  function installDormantReader(collection: string, id: string, cell: InternalItemCell): void {
    setCellReader(cell, () => {
      if (cell.state === 'dormant' && activateCell(collection, id, cell))
        return cell.value.value
      options.trackFallback(collection, id)
      return options.read(collection, id) ?? cell.fallback
    })
  }

  /** Install lazy engine/fallback resolution after registry detachment. */
  function installDetachedReader(collection: string, id: string, cell: InternalItemCell): void {
    setCellReader(cell, () => {
      options.trackFallback(collection, id)
      return options.read(collection, id) ?? cell.fallback
    })
  }
}

/** Replace one source getter so active field reads contain no state branch. */
function setCellReader(cell: InternalItemCell, read: () => any): void {
  cell.read = read
}

/** Mutable cell state hidden from cache consumers. */
interface InternalItemCell extends ItemCell {
  /** Vue cell updated after engine commits. */
  value: ShallowRef<any>
  /** Last readable value retained after detachment or deletion. */
  fallback: any
  /** Lazy, actively synchronized, or externally retained detached state. */
  state: 'dormant' | 'active' | 'detached'
  /** Current dormant, active, or detached read implementation. */
  read: () => any
}
