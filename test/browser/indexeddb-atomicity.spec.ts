import { expect, test } from '@playwright/test'
import { callOffline } from './offlineDriver'

const scenarios = 'offlineAtomicity'

test.afterEach(async ({ page }) => {
  // Disposal releases handles immediately even when a faulty public operation
  // never settles; browser context teardown owns remaining platform work.
  expect(await callOffline(page, scenarios, 'dispose')).toEqual({ disposed: true })
})

test('native IndexedDB rolls back a partially queued batch and permits a complete retry', async ({ page }) => {
  await page.goto('/test/browser/fixtures/index.html')
  await callOffline(page, scenarios, 'initialize')
  await callOffline(page, scenarios, 'startRollback')
  await expect.poll(() => callOffline(page, scenarios, 'state'), {
    message: 'Rejected public applyChanges settles and fresh read observes complete rollback',
    timeout: 2000,
  }).toEqual({
    phase: 'rolled-back',
    failure: 'DataCloneError',
    afterFailure: [
      { id: 'gone', text: 'Keep until commit' },
      { id: 'survivor', done: false },
    ],
  })

  await callOffline(page, scenarios, 'startRetry')
  await expect.poll(() => callOffline(page, scenarios, 'state'), {
    message: 'Valid public applyChanges retry completes and fresh read observes every committed row',
    timeout: 2000,
  }).toEqual({
    phase: 'complete',
    failure: 'DataCloneError',
    afterFailure: [
      { id: 'gone', text: 'Keep until commit' },
      { id: 'survivor', done: false },
    ],
    afterRetry: [
      { id: 'new', text: 'Committed retry' },
      { id: 'survivor', done: false },
      { id: 'valid', done: true },
    ],
  })
})
