import { expect, test } from '@playwright/test'
import { leaveApplication, openFocusPeer, returnToApplication } from './focusDriver'

/** Fixture imports are evaluated by Chromium, never the Node test runner. */
const fixture = '/test/browser/fixtures/focus.ts'

test('returning to an application tab refreshes opted-in queries and stops after unmount', async ({ page, context }) => {
  await page.goto('/test/browser/fixtures/index.html')
  await page.evaluate(async path => (await import(path)).mount(), fixture)
  const peer = await openFocusPeer(page, context)
  try {
    await returnToApplication(page)
    await expect(page.getByTestId('message')).toHaveText('initial')
    await expect(page.getByTestId('passive-message')).toHaveText('initial without focus refresh')
    await expect.poll(() => page.evaluate(async path => (await import(path)).state().focused, fixture)).toBe(true)
    await leaveApplication(page, peer)
    await page.evaluate(async path => (await import(path)).seed('focused'), fixture)
    await returnToApplication(page)
    await expect(page.getByTestId('message')).toHaveText('focused')
    expect(await page.evaluate(async path => (await import(path)).state().error, fixture)).toBeNull()
    await expect(page.getByTestId('passive-message')).toHaveText('initial without focus refresh')
    expect(await page.evaluate(async path => (await import(path)).state().passiveRequests, fixture)).toBe(1)
    const requests = await page.evaluate(async path => (await import(path)).state().requests, fixture)

    await page.evaluate(async path => (await import(path)).unmount(), fixture)
    await expect(page.getByTestId('message')).toHaveCount(0)
    await leaveApplication(page, peer)
    await page.evaluate(async path => (await import(path)).seed('after unmount'), fixture)
    await returnToApplication(page)
    await expect.poll(() => page.evaluate(async path => (await import(path)).state().focused, fixture)).toBe(true)
    expect(await page.evaluate(async path => (await import(path)).state(), fixture)).toEqual({
      error: null,
      requests,
      cached: 'focused',
      passiveCached: 'initial without focus refresh',
      passiveRequests: 1,
      focused: true,
    })
  }
  finally {
    await page.evaluate(async path => (await import(path)).dispose(), fixture)
    await peer.close()
  }
})

/** Separate components exercise many-query options and shared focus ownership. */
const manyFixture = '/test/browser/fixtures/focusMany.ts'

test('reactive many-query focus mode and unmount preserve other mounted consumers', async ({ page, context }) => {
  await page.goto('/test/browser/fixtures/index.html')
  const peer = await openFocusPeer(page, context)
  try {
    await page.evaluate(async path => (await import(path)).mount(), manyFixture)
    await returnToApplication(page)
    await expect(page.getByTestId('todos').locator('li')).toHaveText(['initial todo 1', 'initial todo 2'])
    await expect(page.getByTestId('notes').locator('li')).toHaveText(['initial note 1', 'initial note 2'])

    await leaveApplication(page, peer)
    const before = await page.evaluate(async path => (await import(path)).state(), manyFixture)
    await page.evaluate(async path => (await import(path)).seed('first'), manyFixture)
    await returnToApplication(page)
    await expect(page.getByTestId('todos').locator('li')).toHaveText(['first todo 1', 'first todo 2'])
    await expect(page.getByTestId('notes').locator('li')).toHaveText(['first note 1', 'first note 2'])
    const first = await page.evaluate(async path => (await import(path)).state(), manyFixture)
    expect(first.todos.requests).toBe(before.todos.requests + 1)
    expect(first.notes.requests).toBe(before.notes.requests + 1)

    await page.evaluate(async path => (await import(path)).setMode('manual'), manyFixture)
    await expect.poll(() => page.evaluate(async path => (await import(path)).state().todos.loading, manyFixture)).toBe(false)
    await leaveApplication(page, peer)
    const manual = await page.evaluate(async path => (await import(path)).state(), manyFixture)
    await page.evaluate(async path => (await import(path)).seed('manual'), manyFixture)
    await returnToApplication(page)
    await expect(page.getByTestId('notes').locator('li')).toHaveText(['manual note 1', 'manual note 2'])
    await expect(page.getByTestId('todos').locator('li')).toHaveText(['first todo 1', 'first todo 2'])
    const paused = await page.evaluate(async path => (await import(path)).state(), manyFixture)
    expect(paused.todos.requests).toBe(manual.todos.requests)
    expect(paused.notes.requests).toBe(manual.notes.requests + 1)

    await page.evaluate(async path => (await import(path)).setMode('windowFocus'), manyFixture)
    await expect.poll(() => page.evaluate(async path => (await import(path)).state().todos.loading, manyFixture)).toBe(false)
    await leaveApplication(page, peer)
    const resumed = await page.evaluate(async path => (await import(path)).state(), manyFixture)
    await page.evaluate(async path => (await import(path)).seed('resumed'), manyFixture)
    await returnToApplication(page)
    await expect(page.getByTestId('todos').locator('li')).toHaveText(['resumed todo 1', 'resumed todo 2'])
    await expect(page.getByTestId('notes').locator('li')).toHaveText(['resumed note 1', 'resumed note 2'])
    const active = await page.evaluate(async path => (await import(path)).state(), manyFixture)
    expect(active.todos.requests).toBe(resumed.todos.requests + 1)
    expect(active.notes.requests).toBe(resumed.notes.requests + 1)

    await page.evaluate(async path => (await import(path)).unmount('todos'), manyFixture)
    await expect(page.getByTestId('todos')).toHaveCount(0)
    await leaveApplication(page, peer)
    await page.evaluate(async path => (await import(path)).seed('survivor'), manyFixture)
    await returnToApplication(page)
    await expect(page.getByTestId('notes').locator('li')).toHaveText(['survivor note 1', 'survivor note 2'])
    expect(await page.evaluate(async path => (await import(path)).state(), manyFixture)).toEqual({
      todos: {
        requests: active.todos.requests,
        rows: [{ id: 't1', text: 'resumed todo 1' }, { id: 't2', text: 'resumed todo 2' }],
        loading: false,
        error: null,
      },
      notes: {
        requests: active.notes.requests + 1,
        rows: [{ id: 'n1', text: 'survivor note 1' }, { id: 'n2', text: 'survivor note 2' }],
        loading: false,
        error: null,
      },
    })
  }
  finally {
    await page.evaluate(async path => (await import(path)).dispose(), manyFixture)
    await peer.close()
  }
})
