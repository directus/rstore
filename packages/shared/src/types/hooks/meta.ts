/**
 * Query tracking metadata attached to hook payloads.
 */
export interface HookMetaQueryTracking {
  items: Record<string, Set<string | number>>
  skipped?: boolean
}

// @TODO type generics
export interface CustomHookMeta {
  $queryTracking?: HookMetaQueryTracking
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
