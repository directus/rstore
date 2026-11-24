import type { ResolvedCollection } from '@rstore/shared'
import type { CacheRuntime } from './types'
import type { VisibleListEntry } from './visibleListCache'
import { getWrappedEntry } from './wrapped'

/** How many snapshot rows a rebuild skips to find a row that stayed visible. */
const REMOVAL_LOOKAHEAD = 8

/**
 * Rebuild a collection's visible list, reusing the previous snapshot's
 * wrappers for rows that stayed visible.
 *
 * Unchanged rows keep their relative engine order, so walking both orders
 * side by side matches them without lookups. A reused wrapper must still be
 * registered (its cell is not detached); any other row takes the regular
 * resolve-and-wrap path, so a mismatch only costs the old rebuild work.
 */
export function rebuildVisibleList(
  ctx: CacheRuntime,
  collection: ResolvedCollection<any, any, any>,
  marker: string | undefined,
): VisibleListEntry {
  const snapshot = ctx.visibleListCache.takeSnapshot(collection.name)
  const entry: VisibleListEntry = { items: [], ids: [], cells: [], marker }
  let cursor = 0

  /** Reuse the snapshot row for `id` when it is next in snapshot order. */
  function reuse(id: string): boolean {
    if (!snapshot)
      return false
    const { ids } = snapshot
    let index = cursor
    // Removed rows leave short gaps; a moved or new row matches nothing.
    const limit = Math.min(ids.length, cursor + REMOVAL_LOOKAHEAD + 1)
    while (index < limit && ids[index] !== id) index++
    if (index === limit)
      return false
    cursor = index + 1
    const cell = snapshot.cells[index]!
    if (cell.isDetached())
      return false
    entry.items.push(snapshot.items[index]!)
    entry.ids.push(id)
    entry.cells.push(cell)
    return true
  }

  ctx.engine.scanVisibleRowsRaw({ collection, marker }, reuse, (key, raw, id) => {
    const wrapped = getWrappedEntry(ctx, collection, raw, key)
    entry.items.push(wrapped.item)
    entry.ids.push(id)
    entry.cells.push(wrapped.cell)
  })
  ctx.visibleListCache.set(collection.name, entry)
  return entry
}
