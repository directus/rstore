import type { HybridLogicalClock } from '@rstore/multiplayer/clock'
import process from 'node:process'
import { createHLCClock } from '@rstore/multiplayer/clock'

/**
 * Clock stamping the realtime publishes of this server instance. It is owned
 * by this module, not installed as the process-wide default clock, so two
 * server instances in one process never share (or replace) each other's clock.
 */
let realtimeClock: HybridLogicalClock | undefined

/**
 * Create the realtime clock of this server instance. A stable `nodeId` (from
 * `RSTORE_DRIZZLE_NODE_ID`, falling back to a process-bound random one) keeps
 * tiebreaks consistent across in-flight frames.
 */
export function installRstoreDrizzleRealtimeClock(): HybridLogicalClock {
  const nodeId = process.env.RSTORE_DRIZZLE_NODE_ID
    ?? `rstore-drizzle:${Math.random().toString(16).slice(2, 10)}`
  realtimeClock = createHLCClock(nodeId)
  return realtimeClock
}

/** The realtime clock of this server instance, created on first use. */
export function useRstoreDrizzleRealtimeClock(): HybridLogicalClock {
  return realtimeClock ?? installRstoreDrizzleRealtimeClock()
}
