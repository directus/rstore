import type { EngineChangeSet } from '@rstore/core'

/** Lifecycle-owned Vue dependency registry. */
export interface SignalRegistry {
  /** Track one missing item by canonical key. */
  trackItem: (collection: string, key: string | number) => boolean
  /** Track one collection visible-key signal. */
  trackList: (collection: string) => boolean
  /** Track one opaque exact index dependency. */
  trackIndex: (collection: string, dependency: string) => boolean
  /** Publish one engine operation's changes. */
  flush: (changes: EngineChangeSet) => void
  /** Publish one exact item without aggregate containers. */
  flushItem: (collection: string, key: string) => void
  /** Publish one exact index without aggregate containers. */
  flushIndex: (dependency: string) => void
  /** Invalidate every active signal after reset. */
  reset: () => void
  /** Release every retained signal. */
  dispose: () => void
  /** Count active dependencies for diagnostics. */
  size: () => { items: number, lists: number, indexes: number }
}
