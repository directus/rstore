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
}

export interface AbortableOptions {
  /**
   * If true, the remaining hooks in the queue will not be called.
   * @default true
   */
  abort?: boolean
}
