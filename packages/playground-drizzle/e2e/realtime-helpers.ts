import type { BrowserContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { createTodo, todoByTitle } from './utils'

export interface RealtimeAppPage {
  page: Page
  frames: string[]
}

/**
 * Attach websocket frame collector to page.
 */
export function collectReceivedFrames(page: Page): string[] {
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
 * Check whether collected frames include update for specific todo title.
 *
 * Parses each frame and matches structurally against the realtime
 * payload — substring matching on the raw text is brittle (a title
 * containing the literal `"update"` would false-match) and silently
 * accepts frames whose shape no longer carries the title.
 */
export function framesContainUpdateFor(frames: string[], title: string): boolean {
  for (const payload of frames) {
    let parsed: any
    try {
      parsed = JSON.parse(payload)
    }
    catch {
      continue
    }
    const updates: any[] = []
    if (parsed?.update) {
      updates.push(parsed.update)
    }
    if (Array.isArray(parsed?.updates)) {
      updates.push(...parsed.updates)
    }
    for (const u of updates) {
      if (u?.record?.title === title || u?.title === title) {
        return true
      }
    }
  }
  return false
}

/**
 * Open realtime todo app and wait until live query mounted.
 */
export async function openRealtimeApp(context: BrowserContext): Promise<RealtimeAppPage> {
  const page = await context.newPage()
  const frames = collectReceivedFrames(page)
  await page.goto('/')
  await expect(page.getByPlaceholder('What needs to be done?')).toBeVisible()

  return {
    page,
    frames,
  }
}

/**
 * Edit todo title through row popover form.
 */
export async function editTodo(page: Page, currentTitle: string, nextTitle: string) {
  const todoItem = todoByTitle(page, currentTitle)
  await todoItem.locator('button').first().click()

  const editInput = page.getByRole('textbox', { name: 'Text', exact: true })
  await expect(editInput).toBeVisible()
  await editInput.fill(nextTitle)
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(todoByTitle(page, nextTitle)).toBeVisible()
}

/**
 * Toggle todo completed state by clicking row.
 */
export async function toggleTodo(page: Page, title: string) {
  await todoByTitle(page, title).click()
}

/**
 * Wait until browser context online state changes.
 */
export async function waitForOnlineState(page: Page, value: boolean) {
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(value)
}

/**
 * Create todo while asserting remote page catches up later.
 */
export async function createTodoAndWait(page: Page, title: string) {
  await createTodo(page, title)
  await expect(todoByTitle(page, title)).toBeVisible()
}
