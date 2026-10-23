import type { FieldTimestampValue } from '../crdt'

/**
 * Query tracking metadata attached to hook payloads.
 */
export interface HookMetaQueryTracking {
  items: Record<string, Set<string | number>>
  /** Included relation branches written by this fetch, even when their result is empty. */
  includedRelations?: Record<string, Map<string | number, Set<string>>>
  skipped?: boolean
}

// @TODO type generics
export interface CustomHookMeta {
  /**
   * Server snapshot version of this fetch result. Fetch hooks may set it on the
   * metadata they receive; rstore reads it to order page results and removes it
   * from the published query metadata.
   */
  $resultVersion?: FieldTimestampValue
  $queryTracking?: HookMetaQueryTracking
  /** A durable local queue accepted this mutation; remote commit remains pending. */
  mutationStatus?: 'queued'
  /**
   * Whether a reactive request still has a consumer allowed to publish it.
   * Core combines these checks for deduped consumers; caches recheck before
   * applying deferred writes. Absent for ordinary imperative fetches.
   * @internal
   */
  $canPublishQuery?: () => boolean
}

export interface AbortableOptions {
  /**
   * If true, the remaining hooks in the queue will not be called.
   * @default true
   */
  abort?: boolean
}
