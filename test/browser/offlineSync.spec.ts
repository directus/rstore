import { expect, test } from '@playwright/test'
import { callOffline } from './offlineDriver'

const session = 'offlineSession'
const scenarios = 'offlineSync'

test.beforeEach(async ({ page }) => {
  await page.goto('/test/browser/fixtures/index.html')
})
test.afterEach(async ({ page }) => {
  try {
    await callOffline(page, scenarios, 'cleanup')
    await expect.poll(() => callOffline(page, scenarios, 'cleanupState'), {
      message: 'Released external replies settle every pending sync during cleanup',
      timeout: 1000,
    }).toEqual({ pendingWork: 0 })
  }
  finally {
    await callOffline(page, session, 'dispose')
  }
})

test('replays saved create before pull reconciles missing remote keys', async ({ page }) => {
  await callOffline(page, session, 'initialize')
  const result = await callOffline(page, scenarios, 'replayBeforePull')
  expect(result.pullRemoteRows).toContainEqual({ id: 'offline-1', text: 'a' })
  expect(result.remote).toContainEqual({ id: 'offline-1', text: 'a' })
  expect(result.cache).toEqual([{ id: 'offline-1', text: 'a' }])
  expect(result.mirror).toEqual([{ id: 'offline-1', text: 'a' }])
})

test('overlapping public sync calls replay once and both finish after remote release', async ({ page }) => {
  await callOffline(page, session, 'initialize')
  await callOffline(page, scenarios, 'startOverlapping')
  await expect.poll(() => callOffline(page, scenarios, 'overlapState')).toEqual({ calls: 1, completed: 0, settled: 0, rejected: [] })
  await callOffline(page, scenarios, 'releaseOverlap')
  await expect.poll(() => callOffline(page, scenarios, 'overlapState'), { message: 'Both original sync consumers complete after external replay reply is released' }).toEqual({ calls: 1, completed: 2, settled: 2, rejected: [] })
  const result = await callOffline(page, session, 'snapshot')
  expect(result.queue).toEqual([])
  expect(result.cache).toEqual([{ id: '1', text: 'updated' }])
  expect(result.remote).toContainEqual({ id: '1', text: 'updated' })
  expect(await callOffline(page, scenarios, 'overlapState')).toEqual({ calls: 1, completed: 2, settled: 2, rejected: [] })
})

test('offline sync hooks coordinate overlapping plugin consumers even outside public sync guard', async ({ page }) => {
  await callOffline(page, session, 'initialize')
  await callOffline(page, scenarios, 'startOverlapping', true)
  await expect.poll(() => callOffline(page, scenarios, 'overlapState')).toEqual({ calls: 1, completed: 0, settled: 0, rejected: [] })
  await callOffline(page, scenarios, 'releaseOverlap')
  await expect.poll(() => callOffline(page, scenarios, 'overlapState'), { message: 'Both original sync consumers complete after external replay reply is released' }).toEqual({ calls: 1, completed: 2, settled: 2, rejected: [] })
  const result = await callOffline(page, session, 'snapshot')
  expect(result.queue).toEqual([])
  expect(result.cache).toEqual([{ id: '1', text: 'updated' }])
  expect(await callOffline(page, scenarios, 'overlapState')).toEqual({ calls: 1, completed: 2, settled: 2, rejected: [] })
})

test('finished sync permits later fresh remote pull', async ({ page }) => {
  await callOffline(page, session, 'initialize')
  const result = await callOffline(page, scenarios, 'freshPulls')
  expect(result.pulls).toBe(2)
  expect(result.first.cache).toEqual([{ id: '1', text: 'pull-1' }])
  expect(result.second.cache).toEqual([{ id: '1', text: 'pull-2' }])
})

test('timeout resumes cache and future valid sync persists every recovered row', async ({ page }) => {
  await callOffline(page, session, 'initialize', { syncCollectionTimeout: 30 })
  await callOffline(page, scenarios, 'startRecovery')
  await expect.poll(async () => (await callOffline(page, scenarios, 'recoveryState')).settled, {
    message: 'Configured collection timeout settles held public sync',
  }).toBe(true)
  const failed = await callOffline(page, scenarios, 'recoveryState')
  expect(failed.error).toContain('Todos')
  expect(failed.error).toContain('timed out')
  expect(failed.rejected).toBeUndefined()
  const resumed = await callOffline(page, scenarios, 'finishRecovery')
  expect(resumed.cache).toEqual([{ id: 'after-failure' }])
  await callOffline(page, scenarios, 'startValidRecovery')
  await expect.poll(async () => (await callOffline(page, scenarios, 'recoveryState')).settled, {
    message: 'Valid later public sync completes after timeout cleanup',
  }).toBe(true)
  const recovered = await callOffline(page, session, 'snapshot')
  expect(recovered.error).toBeUndefined()
  expect(recovered.cache).toEqual([{ id: 'recovered-1', text: 'first' }, { id: 'recovered-2', text: 'second' }])
  expect(recovered.mirror).toEqual([{ id: 'recovered-1', text: 'first' }, { id: 'recovered-2', text: 'second' }])
})

test('caller abort settles held pull and resumes cache with cancellation reason', async ({ page }) => {
  await callOffline(page, session, 'initialize')
  await callOffline(page, scenarios, 'startRecovery', true)
  await expect.poll(async () => (await callOffline(page, scenarios, 'recoveryState')).started, {
    message: 'Real collection pull starts before caller cancellation',
  }).toBe(true)
  await callOffline(page, scenarios, 'abortRecovery')
  await expect.poll(async () => (await callOffline(page, scenarios, 'recoveryState')).settled, {
    message: 'Caller cancellation settles original public sync before held reply is released',
  }).toBe(true)
  const state = await callOffline(page, scenarios, 'recoveryState')
  expect(state.error).toBe('cancelled by caller')
  expect(state.rejected).toBeUndefined()
  const resumed = await callOffline(page, scenarios, 'finishRecovery')
  expect(resumed.cache).toEqual([{ id: 'after-failure' }])
})

test('configured inclusion pulls selected collection and preserves denied collection', async ({ page }) => {
  await callOffline(page, scenarios, 'initializeFiltered')
  const result = await callOffline(page, scenarios, 'pullSelected')
  expect(result.pulls).toEqual(['Todos'])
  expect(result.requests.map(({ hook, collection }: any) => ({ hook, collection }))).toEqual([{ hook: 'fetchMany', collection: 'Todos' }])
  expect(result.cache).toEqual([{ id: 'server-row', text: 'allowed' }])
  expect(result.mirror).toEqual([{ id: 'server-row', text: 'allowed' }])
  expect(JSON.parse(result.metadata).updatedAt).toBeGreaterThan(0)
  expect(result.notesCache).toEqual([])
  expect(result.notesMirror).toEqual([{ id: 'kept-note', text: 'private mirror' }])
  expect(result.notesMetadata).toBe(JSON.stringify({ updatedAt: 456 }))
})

test('collection excluded during held pull never enters cache or persistence', async ({ page }) => {
  await callOffline(page, scenarios, 'initializeFiltered')
  await callOffline(page, scenarios, 'startExcludedPull')
  await expect.poll(() => callOffline(page, scenarios, 'excludedPullState'), {
    message: 'Selected consumer and real remote fetch enter before predicate changes',
    timeout: 1000,
  }).toEqual({ pulls: ['Todos'], calls: 1, settled: false })
  await callOffline(page, scenarios, 'excludeAndRelease')
  await expect.poll(() => callOffline(page, scenarios, 'excludedPullState'), {
    message: 'Original public sync completes after held response despite exclusion',
    timeout: 1000,
  }).toEqual({ pulls: ['Todos'], calls: 1, settled: true })
  const result = await callOffline(page, scenarios, 'filteredSnapshot')
  expect(result.cache).toEqual([])
  expect(result.mirror).toEqual([])
  expect(result.metadata).toBeNull()
  expect(result.notesCache).toEqual([])
  expect(result.notesMirror).toEqual([{ id: 'kept-note', text: 'private mirror' }])
  expect(result.notesMetadata).toBe(JSON.stringify({ updatedAt: 456 }))
})

test('consumer cursor opt-out leaves stored cursor untouched', async ({ page }) => {
  await callOffline(page, session, 'initialize')
  expect(await callOffline(page, scenarios, 'skipCursor')).toEqual({
    afterSkip: JSON.stringify({ updatedAt: 123 }),
    afterNextPull: JSON.stringify({ updatedAt: 123 }),
    pulls: [123, 123],
  })
})

test('cursor precedes remote pull completion on real browser clock', async ({ page }) => {
  await callOffline(page, session, 'initialize')
  const result = await callOffline(page, scenarios, 'cursorBeforePull')
  expect(result.cursor).toBeGreaterThan(0)
  expect(result.cursor).toBeLessThanOrEqual(result.started)
  expect(result.cursor).toBeLessThan(result.finished)
})
