import type { BrowserContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { callOffline } from './offlineDriver'

const scenarios = 'offlineReconnect'

/** Generate genuine navigator state changes and wait for their native window events. */
async function reconnect(page: Page, context: BrowserContext, count = 1) {
  for (let index = 0; index < count; index++) {
    const before = await callOffline(page, scenarios, 'state')
    await context.setOffline(true)
    await expect.poll(async () => {
      const state = await callOffline(page, scenarios, 'state')
      return { online: state.online, events: state.connectivityEvents.slice(before.connectivityEvents.length) }
    }, { message: 'Browser publishes native offline event and navigator state' }).toEqual({ online: false, events: ['offline'] })
    await context.setOffline(false)
    await expect.poll(async () => {
      const state = await callOffline(page, scenarios, 'state')
      return { online: state.online, events: state.connectivityEvents.slice(before.connectivityEvents.length) }
    }, { message: 'Browser publishes native online event and navigator state' }).toEqual({ online: true, events: ['offline', 'online'] })
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/test/browser/fixtures/index.html')
})
test.afterEach(async ({ page }) => {
  await callOffline(page, scenarios, 'cleanup')
  await callOffline(page, 'offlineSession', 'dispose')
})

test('online event burst debounces into one completed sync on real timers', async ({ page, context }) => {
  await callOffline(page, scenarios, 'initialize')
  await reconnect(page, context, 3)
  const pending = await callOffline(page, scenarios, 'state')
  expect(pending.pulls).toEqual([0])
  await expect.poll(async () => (await callOffline(page, scenarios, 'state')).cache).toEqual([[{ id: 'synced', text: 'store-0-pull-1' }]])
  expect((await callOffline(page, scenarios, 'state')).pulls).toEqual([1])
})

test('online events during in-flight pull do not duplicate sync, later event starts fresh pull', async ({ page, context }) => {
  await callOffline(page, scenarios, 'initialize')
  await callOffline(page, scenarios, 'holdPull')
  await reconnect(page, context)
  await expect.poll(async () => (await callOffline(page, scenarios, 'state')).pulls).toEqual([1])
  await reconnect(page, context)
  // Observe after full native debounce interval while remote reply remains held.
  await expect.poll(async () => {
    const state = await callOffline(page, scenarios, 'state')
    return state.elapsed > state.debounce + 100
  }).toBe(true)
  expect((await callOffline(page, scenarios, 'state')).pulls).toEqual([1])
  await callOffline(page, scenarios, 'releasePull')
  await expect.poll(async () => (await callOffline(page, scenarios, 'state')).syncing).toEqual([false])
  await reconnect(page, context)
  await expect.poll(async () => (await callOffline(page, scenarios, 'state')).cache).toEqual([[{ id: 'synced', text: 'store-0-pull-2' }]])
})

test('store recreation directs reconnect only to most recent real store', async ({ page, context }) => {
  await callOffline(page, scenarios, 'initialize', true)
  await reconnect(page, context)
  await expect.poll(async () => (await callOffline(page, scenarios, 'state')).cache).toEqual([[], [{ id: 'synced', text: 'store-1-pull-1' }]])
  expect((await callOffline(page, scenarios, 'state')).pulls).toEqual([0, 1])
})

test('reconnect opt-out ignores online events while manual public trigger still syncs', async ({ page, context }) => {
  await callOffline(page, scenarios, 'initializeDisabled')
  await reconnect(page, context)
  await expect.poll(async () => {
    const state = await callOffline(page, scenarios, 'state')
    return state.elapsed > state.debounce + 100
  }).toBe(true)
  expect((await callOffline(page, scenarios, 'state')).cache).toEqual([[]])
  const result = await callOffline(page, scenarios, 'manualSync')
  expect(result.cache).toEqual([[{ id: 'synced', text: 'store-0-pull-1' }]])
  expect(result.pulls).toEqual([1])
})
