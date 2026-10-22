import { expect, test } from '@playwright/test'
import { callOffline } from './offlineDriver'

test('devtools reports durable offline acceptance without claiming remote commit', async ({ page, context }) => {
  await page.goto('/test/browser/fixtures/index.html')
  await callOffline(page, 'devtoolsOffline', 'initializeDevtools')
  try {
    await context.setOffline(true)
    const result = await callOffline(page, 'devtoolsOffline', 'createOffline')
    expect(result.outcomes.map((outcome: any) => [outcome.status, outcome.queued])).toEqual([['accepted', true], ['accepted', true]])
    expect(result.snapshot.online).toBe(false)
    expect(result.snapshot.requests).toEqual([])
    expect(result.snapshot.remote).toEqual([
      { id: '1', text: 'original' },
      { id: '2', text: 'second' },
      { id: '3', text: 'survivor' },
    ])
    expect(result.snapshot.queue.map((operation: any) => [operation.type, operation.key, operation.item]).sort()).toEqual([
      ['create', 'devtools-one', { id: 'devtools-one', text: 'First queued' }],
      ['create', 'devtools-two', { id: 'devtools-two', text: 'Second queued' }],
    ])
    expect(result.snapshot.cache).toEqual([
      { id: 'devtools-one', text: 'First queued' },
      { id: 'devtools-two', text: 'Second queued' },
    ])
    expect(result.snapshot.mirror).toEqual([
      { id: 'devtools-one', text: 'First queued' },
      { id: 'devtools-two', text: 'Second queued' },
    ])
  }
  finally {
    await context.setOffline(false)
    await callOffline(page, 'devtoolsOffline', 'disposeDevtools')
    await callOffline(page, 'offlineSession', 'dispose')
  }
})
