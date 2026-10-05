import type { GlobalStoreType } from '@rstore/shared'
import { scheduleTombstoneGc } from '../lww/index.js'
import { createTombstoneView } from './store.js'

/** Tombstone GC settings of `createMultiplayerPlugin()`. */
export interface TombstoneGcOptions {
  /** Sweep interval in ms. @default 60_000 */
  intervalMs?: number
  /** Drop tombstones older than this many ms. @default 86_400_000 (24 h) */
  ttlMs?: number
}

/**
 * Start the periodic tombstone sweep of a store, on clients only: server
 * stores are short-lived and must not keep a timer.
 *
 * @param store Store whose cache holds the tombstones.
 * @param options GC settings, or `false` to disable.
 * @returns A function stopping the timer, or `undefined` when none started.
 */
export function startTombstoneGc(store: GlobalStoreType, options: TombstoneGcOptions | false): (() => void) | undefined {
  if (options === false || store.$isServer || typeof setInterval === 'undefined') {
    return undefined
  }
  return scheduleTombstoneGc(createTombstoneView(store.$cache), {
    intervalMs: options.intervalMs ?? 60_000,
    ttlMs: options.ttlMs ?? 24 * 60 * 60 * 1000,
  })
}
