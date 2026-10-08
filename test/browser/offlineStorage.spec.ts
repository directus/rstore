import { expect, test } from '@playwright/test'
import { callOffline } from './offlineDriver'

const scenarios = 'offlineStorage'

test.beforeEach(async ({ page }) => {
  await page.goto('/test/browser/fixtures/index.html')
})
test.afterEach(async ({ page }) => {
  await callOffline(page, 'offlineSession', 'dispose')
})

test('version change clears mirror and cursor but preserves queued user work with warning', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning')
      warnings.push(message.text())
  })
  const result = await callOffline(page, scenarios, 'versionCleanup', { version: 2 })
  expect(result.mirror).toEqual([])
  expect(result.lists).toEqual([])
  expect(result.metadata).toBeNull()
  expect(result.listsMetadata).toBeNull()
  expect(result.notes).toEqual([{ id: 'note', title: 'excluded note' }])
  expect(result.notesMetadata).toBe(JSON.stringify({ updatedAt: 789 }))
  expect(result.queue.map((op: any) => op.id)).toEqual(['op-1'])
  expect(warnings).toEqual([expect.stringContaining('1 queued offline operation(s)')])
})

test('explicit version queue cleanup drops queued work without preservation warning', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning')
      warnings.push(message.text())
  })
  const result = await callOffline(page, scenarios, 'versionCleanup', { version: 2, clearQueueOnVersionChange: true })
  expect(result.queue).toEqual([])
  expect(result.mirror).toEqual([])
  expect(result.lists).toEqual([])
  expect(result.metadata).toBeNull()
  expect(result.listsMetadata).toBeNull()
  expect(result.notes).toEqual([{ id: 'note', title: 'excluded note' }])
  expect(result.notesMetadata).toBe(JSON.stringify({ updatedAt: 789 }))
  expect(warnings).toEqual([])
})

for (const options of [{ version: 2, storedVersion: 2 }, {}]) {
  test(`keeps rows and cursor when ${'version' in options ? 'version matches' : 'version option is absent'}`, async ({ page }) => {
    const result = await callOffline(page, scenarios, 'versionCleanup', options)
    expect(result.mirror).toEqual([{ id: '1' }])
    expect(result.lists).toEqual([{ id: 'list', title: 'selected list' }])
    expect(result.notes).toEqual([{ id: 'note', title: 'excluded note' }])
    expect(result.metadata).toBe(JSON.stringify({ updatedAt: 123 }))
    expect(result.listsMetadata).toBe(JSON.stringify({ updatedAt: 456 }))
    expect(result.notesMetadata).toBe(JSON.stringify({ updatedAt: 789 }))
    expect(result.queue.map((op: any) => op.id)).toEqual(['op-1'])
  })
}

test('public storage sorts replay queue and clears only requested collections and metadata', async ({ page }) => {
  const result = await callOffline(page, scenarios, 'publicStorage')
  expect(result.orderedQueue).toEqual([
    { id: 'z-oldest', type: 'delete', collectionName: 'Todos', key: '1', time: new Date(10).toISOString() },
    { id: 'a-newest', type: 'delete', collectionName: 'Todos', key: '2', time: new Date(20).toISOString() },
  ])
  expect(result.queue).toEqual([])
  expect(result.todos).toEqual([])
  expect(result.lists).toEqual([])
  expect(result.notes).toEqual([{ id: 'n' }])
  expect(result.metadata).toBeNull()
  expect(result.listsMetadata).toBeNull()
  expect(result.notesMetadata).toBe(JSON.stringify({ updatedAt: 2 }))
})
