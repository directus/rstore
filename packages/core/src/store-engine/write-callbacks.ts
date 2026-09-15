import type { ResolvedCollection } from '@rstore/shared'
import type { EngineChangeInterest } from './observer-changes.js'

/** Allocation-light write payload for framework adapters. */
export interface EngineWriteCommitPayload {
  /** Collection targeted by public write. */
  collection: ResolvedCollection<any, any, any>
  /** Single-write key retained for hook compatibility. */
  key?: string | number
  /** Previous public key representation when canonical form changed. */
  previousKey?: string | number
  /** Whether public numeric/string representation changed. */
  keyFormChanged?: boolean
  /** Whether item visibility changed. */
  visibilityChanged?: boolean
  /** Hook result retained for hook compatibility. */
  result?: any
  /** Optional query marker set by write. */
  marker?: string
  /** Applied operation kind. */
  operation: 'write' | 'delete'
}

/** Immediate framework projection receiving compact operation changes. */
export interface EngineStateChangeSink {
  /** Return exact dependencies consumed by this sink for lazy operation start. */
  getInterest?: () => EngineChangeInterest | undefined
  /** Start operation and report whether any dependency is active. */
  begin: () => boolean
  /** Return whether one canonical item is consumed. */
  wantsItem: (collection: string, key: string) => boolean
  /** Return whether one visible collection list is consumed. */
  wantsList: (collection: string) => boolean
  /** Return whether one already-encoded index dependency is consumed. */
  wantsIndex: (dependency: string) => boolean
  /** Buffer one final resolved item value without publishing it yet. */
  recordItem: (
    collection: string,
    key: string,
    value: unknown,
    keyFormChange?: { previousKey: string | number, key: string | number },
  ) => void
  /** Buffer one visible collection membership change. */
  recordList: (collection: string) => void
  /** Buffer one opaque index dependency change. */
  recordIndex: (dependency: string) => void
  /** Buffer one collection reset without unrelated engine keys. */
  recordCollectionReset: (collection: string) => void
  /** Publish buffered changes after commit and cursor advancement. */
  commit: () => void
  /** Discard buffered records after failure or empty operation. */
  discard: () => void
}
