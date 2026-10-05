import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import { pageDir } from './globalSetup'

/**
 * E9 memory soak: 5 bots edit a 200-block document for `RSTORE_OT_SOAK_MS`
 * (10 minutes for the gate). Off by default: it runs for minutes.
 */
const durationMs = Number(process.env.RSTORE_OT_SOAK_MS ?? 0)
/** Op log entries the in-page sequencer keeps (the retention bound of the server's memory). */
const minOps = 2_000
const MB = 1024 * 1024

test.skip(!durationMs, 'set RSTORE_OT_SOAK_MS to run the soak')

test('client heap stays flat while 5 bots edit a 200-block document (E9)', async ({ page }) => {
  test.setTimeout(durationMs + 5 * 60_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(String(error.stack ?? error)))
  await page.goto(`file://${join(pageDir, 'index.html')}`)
  await page.waitForFunction(() => 'collabSoak' in window)
  const cdp = await page.context().newCDPSession(page)
  /** Used JS heap after a full GC. */
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage')
    return (await cdp.send('Runtime.getHeapUsage')).usedSize
  }

  await page.evaluate(() => window.collabSoak.create({ bots: 5, minOps: 2_000, seed: 1 }))
  await page.evaluate(() => window.collabSoak.soak().start(200))
  // Warm-up: JIT, caches and the op log filling up to its retention.
  const warmupMs = Math.min(60_000, durationMs / 5)
  await page.waitForTimeout(warmupMs)
  const samples = [{ atMs: 0, heap: await heap() }]
  const sampleEveryMs = Math.max(10_000, (durationMs - warmupMs) / 10)
  for (let elapsed = sampleEveryMs; elapsed <= durationMs - warmupMs; elapsed += sampleEveryMs) {
    await page.waitForTimeout(sampleEveryMs)
    samples.push({ atMs: elapsed, heap: await heap() })
  }
  await page.evaluate(() => window.collabSoak.soak().stop())
  const stats = await page.evaluate(() => window.collabSoak.soak().stats())
  const growth = samples.at(-1)!.heap - samples[0]!.heap
  const report = { durationMs, warmupMs, minOps, ...stats, heapStartMB: samples[0]!.heap / MB, heapEndMB: samples.at(-1)!.heap / MB, growthMB: growth / MB, samplesMB: samples.map(sample => Math.round(sample.heap / MB * 10) / 10) }
  if (process.env.RSTORE_OT_SOAK_REPORT) {
    appendFileSync(process.env.RSTORE_OT_SOAK_REPORT, `${JSON.stringify(report)}\n`)
  }
  expect(errors).toEqual([])
  expect(stats.converged).toBe(true)
  // The page holds the clients and the sequencer: the server part is bounded by retention.
  expect(stats.retainedEntries).toBeLessThanOrEqual(minOps + 1_000)
  expect(growth).toBeLessThan(10 * MB)
})
