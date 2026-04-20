import type { BrowserContext, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { createTodo, todoByTitle, uniqueText } from './utils'

/**
 * Attaches a WebSocket frame collector to the given page. Returns the mutable
 * array of text frames received by any websocket opened from that page — the
 * test uses it to assert skip-self behavior (i.e. that a tab does NOT receive
 * an `update` frame for a mutation it triggered itself).
 */
function collectReceivedFrames(page: Page): string[] {
  const frames: string[] = []
  page.on('websocket', (ws) => {
    ws.on('framereceived', (frame) => {
      if (typeof frame.payload === 'string') {
        frames.push(frame.payload)
      }
    })
  })
  return frames
}

/**
 * Returns `true` if any collected frame carries an `update` for the given
 * todo title. The payload contains the full record, so a substring check on
 * the unique title is enough without having to parse every JSON frame.
 */
function framesContainUpdateFor(frames: string[], title: string): boolean {
  return frames.some(payload => payload.includes('"update"') && payload.includes(title))
}

async function openApp(context: BrowserContext): Promise<{ page: Page, frames: string[] }> {
  const page = await context.newPage()
  const frames = collectReceivedFrames(page)
  await page.goto('/')
  // Ensure the liveQuery has mounted before running the scenario so the WS
  // subscription is registered server-side.
  await expect(page.getByPlaceholder('What needs to be done?')).toBeVisible()
  return { page, frames }
}

test.describe('realtime', () => {
  test('cross-tab live updates: create propagates without reload', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()

    try {
      const { page: pageA } = await openApp(ctxA)
      const { page: pageB } = await openApp(ctxB)

      const text = uniqueText('realtime-create')
      await createTodo(pageA, text)

      // Tab B didn't create the todo but must still see it via the WS frame.
      await expect(todoByTitle(pageB, text)).toBeVisible({ timeout: 5_000 })
    }
    finally {
      await ctxA.close()
      await ctxB.close()
    }
  })

  test('cross-tab live updates: delete propagates without reload', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()

    try {
      const { page: pageA } = await openApp(ctxA)
      const { page: pageB } = await openApp(ctxB)

      const text = uniqueText('realtime-delete')
      await createTodo(pageA, text)
      await expect(todoByTitle(pageB, text)).toBeVisible({ timeout: 5_000 })

      // Delete from A via the last action button on the todo row.
      await todoByTitle(pageA, text).locator('button').last().click()

      // B must observe the removal via a `deleted` WS frame.
      await expect(todoByTitle(pageB, text)).toHaveCount(0, { timeout: 5_000 })
    }
    finally {
      await ctxA.close()
      await ctxB.close()
    }
  })

  test('skip-self: the originating tab does not receive its own update frame', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()

    try {
      const { page: pageA, frames: framesA } = await openApp(ctxA)
      const { page: pageB } = await openApp(ctxB)

      const selfText = uniqueText('realtime-skip-self')
      await createTodo(pageA, selfText)

      // Now trigger a mutation from B that *should* reach A. Waiting for its
      // frame to land on A guarantees any would-be echo for A's own mutation
      // has already had its chance to arrive (servers process publishes in
      // order, so "B's frame was delivered" ⇒ "A's echo, if any, was too").
      const otherText = uniqueText('realtime-skip-other')
      await createTodo(pageB, otherText)
      await expect(todoByTitle(pageA, otherText)).toBeVisible({ timeout: 5_000 })

      // A must have received B's update...
      expect(framesContainUpdateFor(framesA, otherText)).toBe(true)
      // ...but not its own (skip-self).
      expect(framesContainUpdateFor(framesA, selfText)).toBe(false)
    }
    finally {
      await ctxA.close()
      await ctxB.close()
    }
  })
})
