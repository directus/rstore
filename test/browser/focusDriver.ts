import type { BrowserContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** Disable Playwright's always-focused emulation and create a real competing tab. */
export async function openFocusPeer(page: Page, context: BrowserContext): Promise<Page> {
  const mainSession = await context.newCDPSession(page)
  await mainSession.send('Emulation.setFocusEmulationEnabled', { enabled: false })
  const peer = await context.newPage()
  try {
    const peerSession = await context.newCDPSession(peer)
    await peerSession.send('Emulation.setFocusEmulationEnabled', { enabled: false })
    await peer.goto('/test/browser/fixtures/index.html')
    return peer
  }
  catch (error) {
    await peer.close()
    throw error
  }
}

/** Activate the competing tab and verify that Chromium actually removed document focus. */
export async function leaveApplication(page: Page, peer: Page): Promise<void> {
  await peer.bringToFront()
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(false)
}

/** Restore native focus and pass a frame barrier after browser event delivery. */
export async function returnToApplication(page: Page): Promise<void> {
  await page.bringToFront()
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}
