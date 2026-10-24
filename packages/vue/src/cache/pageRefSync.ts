import type { EngineWriteCommitPayload } from '@rstore/core'
import type { CacheStateInput } from '@rstore/shared'
import type { CacheRuntime } from './types'
import { clonePageRefs, invalidateMissingPageRefsForItem, resetItemWrites } from './queryState'

/**
 * Release saved absence that a committed write can contradict.
 *
 * Single writes carry their key. A `writeItems` batch publishes one payload
 * whose result lists every written `{ key, value }` entry.
 */
export function invalidatePageRefsForWrite(ctx: CacheRuntime, payload: EngineWriteCommitPayload): void {
  const collectionName = payload.collection.name
  if (payload.key != null) {
    invalidateMissingPageRefsForItem(ctx, collectionName, payload.key)
    return
  }
  if (Array.isArray(payload.result)) {
    for (const entry of payload.result) {
      if (entry?.key != null) {
        invalidateMissingPageRefsForItem(ctx, collectionName, entry.key)
      }
    }
  }
}

/**
 * Replace saved page refs with the ones carried by a hydrated snapshot.
 *
 * The engine owns rows and query metadata; page refs are Vue query state, so
 * they travel as an extra snapshot field and are detached on the way in.
 */
export function restoreSnapshotPageRefs(ctx: CacheRuntime, snapshot: CacheStateInput | undefined): void {
  ctx.state.pageRefs.clear()
  const pageRefs = snapshot && 'pageRefs' in snapshot ? snapshot.pageRefs : undefined
  for (const [pageId, saved] of clonePageRefs(Object.entries(pageRefs ?? {}))) {
    ctx.state.pageRefs.set(pageId, saved)
  }
  resetItemWrites(ctx)
}
