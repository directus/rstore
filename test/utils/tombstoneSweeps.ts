import { createTombstoneStore, scheduleTombstoneGc } from '@rstore/core'
import { expect, vi } from 'vitest'

/** Wait for real control sweeps before checking that a disabled collector stayed idle. */
export async function waitForTombstoneSweeps(intervalMs: number, count = 3): Promise<void> {
  let sweeps = 0
  const stop = scheduleTombstoneGc(createTombstoneStore(), {
    intervalMs,
    ttlMs: 1_000,
    onSweep: () => sweeps++,
  })
  try {
    await vi.waitFor(() => {
      expect(sweeps, 'control collector must complete real sweeps').toBeGreaterThanOrEqual(count)
    }, { timeout: 1_000, interval: intervalMs })
  }
  finally {
    stop()
  }
}
