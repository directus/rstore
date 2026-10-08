import { expect, test } from '@playwright/test'
import { callOffline } from './offlineDriver'

const session = 'offlineSession'
const scenarios = 'offlineQueue'

test.beforeEach(async ({ page }) => {
  await page.goto('/test/browser/fixtures/index.html')
  await callOffline(page, session, 'initialize')
})
test.afterEach(async ({ page }) => {
  await callOffline(page, session, 'dispose')
})

test('replays every queued update and preserves unrelated remote rows', async ({ page }) => {
  await callOffline(page, scenarios, 'seedUpdates')
  const saved = await callOffline(page, session, 'snapshot')
  expect(saved.queue).toEqual([
    { id: 'a-newest', type: 'update', collectionName: 'Todos', key: '2', item: { id: '2', text: 'second updated' }, time: new Date(20).toISOString() },
    { id: 'z-oldest', type: 'update', collectionName: 'Todos', key: '1', item: { id: '1', text: 'updated' }, time: new Date(10).toISOString() },
  ])
  const result = await callOffline(page, session, 'sync')
  expect(result.remote).toEqual([{ id: '1', text: 'updated' }, { id: '2', text: 'second updated' }, { id: '3', text: 'survivor' }])
  expect(result.cache).toEqual([{ id: '1', text: 'updated' }, { id: '2', text: 'second updated' }])
  expect(result.queue).toEqual([])
  expect(result.requests).toEqual([
    { hook: 'updateItem', collection: 'Todos', key: '1', item: { id: '1', text: 'updated' } },
    { hook: 'updateItem', collection: 'Todos', key: '2', item: { id: '2', text: 'second updated' } },
  ])
})

test('drops permanent rejected work and continues later queued updates', async ({ page }) => {
  await callOffline(page, scenarios, 'seedUpdates')
  await callOffline(page, scenarios, 'failUpdate', 422)
  const result = await callOffline(page, session, 'sync')
  expect(result.queue).toEqual([])
  expect(result.remote).toEqual([{ id: '1', text: 'original' }, { id: '2', text: 'second updated' }, { id: '3', text: 'survivor' }])
})

test('keeps transient failure for successful later retry', async ({ page }) => {
  await callOffline(page, session, 'queue')
  await callOffline(page, scenarios, 'failUpdate', 503)
  const failed = await callOffline(page, session, 'sync')
  expect(failed.queue.map((op: any) => op.id)).toEqual(['op-1'])
  expect(failed.remote).toEqual([{ id: '1', text: 'original' }, { id: '2', text: 'second' }, { id: '3', text: 'survivor' }])
  const recovered = await callOffline(page, session, 'sync')
  expect(recovered.queue).toEqual([])
  expect(recovered.remote).toEqual([{ id: '1', text: 'updated' }, { id: '2', text: 'second' }, { id: '3', text: 'survivor' }])
})

test('keeps queued work without sending while browser is offline', async ({ page, context }) => {
  await callOffline(page, session, 'queue')
  await context.setOffline(true)
  const result = await callOffline(page, session, 'sync')
  expect(result.online).toBe(false)
  expect(result.requests).toEqual([])
  expect(result.queue.map((op: any) => op.id)).toEqual(['op-1'])
})

test('drops delete of missing remote row and preserves survivors', async ({ page }) => {
  await callOffline(page, scenarios, 'seedMissingDelete')
  const result = await callOffline(page, session, 'sync')
  expect(result.queue).toEqual([])
  expect(result.remote).toEqual([{ id: '2', text: 'second' }, { id: '3', text: 'survivor' }])
})

test('replaces optimistic create key with server key in cache and native mirror', async ({ page }) => {
  await callOffline(page, scenarios, 'seedRenamedCreate')
  const result = await callOffline(page, session, 'sync')
  expect(result.cache).toEqual([{ id: 'server-key', text: 'draft' }])
  expect(result.mirror).toEqual([{ id: 'server-key', text: 'draft' }])
  expect(result.queue).toEqual([])
  expect(result.remote).toEqual([{ id: '1', text: 'original' }, { id: '2', text: 'second' }, { id: '3', text: 'survivor' }, { id: 'server-key', text: 'draft' }])
})

for (const type of ['create', 'createMany'] as const) {
  test(`queues ${type} and native local mirror even when caller skips cache`, async ({ page, context }) => {
    await context.setOffline(true)
    const items = type === 'create' ? [{ id: 'a', text: 'A' }] : [{ id: 'b', text: 'B' }, { id: 'c', text: 'C' }]
    const result = await callOffline(page, session, 'mutate', { type, item: items[0], items, skipCache: true })
    expect(result.mirror).toEqual(items)
    expect(result.requests).toEqual([])
    expect(result.queue).toEqual([expect.objectContaining({ type, collectionName: 'Todos', ...(type === 'create' ? { key: 'a', item: items[0] } : { keys: ['b', 'c'], items }) })])
    expect(result.queue[0].id).toEqual(expect.any(String))
    expect(Number.isNaN(Date.parse(result.queue[0].time))).toBe(false)
  })
}
