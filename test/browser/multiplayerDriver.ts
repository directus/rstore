import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** Execute fixture exports in browser without replacing owned application code. */
export async function callMultiplayer(page: Page, name: 'mount' | 'snapshot' | 'action' | 'dispose', ...args: any[]): Promise<any> {
  return page.evaluate(async ({ name, args }) => {
    const path = '/test/browser/fixtures/multiplayer.ts'
    const fixture = await import(/* @vite-ignore */ path)
    return (fixture[name] as (...values: any[]) => unknown)(...args)
  }, { name, args })
}

/** Relay URLs isolate independent tests and parallel private probe servers. */
export function relayURL(session: string, operation = 'state'): string {
  return `/__multiplayer/${operation}?session=${encodeURIComponent(session)}`
}

/** Connect two actual applications and acknowledge both presence directions. */
export async function mountMultiplayerPair(page: Page, session: string, tracked = true): Promise<void> {
  for (const id of ['alice', 'bob'])
    await callMultiplayer(page, 'mount', { id, session, tracked })
  for (const id of ['alice', 'bob'])
    await expect.poll(async () => (await callMultiplayer(page, 'snapshot', id)).status).toBe('OPEN')
  // The raw relay does not retain presence for a socket that has not opened.
  for (const id of ['alice', 'bob']) {
    await callMultiplayer(page, 'action', id, 'join')
  }
  for (const id of ['alice', 'bob'])
    await expect.poll(async () => (await callMultiplayer(page, 'snapshot', id)).peers.length).toBe(1)
}
