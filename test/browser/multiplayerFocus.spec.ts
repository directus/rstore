import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { leaveApplication, openFocusPeer, returnToApplication } from './focusDriver'
import { callMultiplayer, mountMultiplayerPair, relayURL } from './multiplayerDriver'

/** Session and peer acquired independently of production discovery/cleanup. */
let session: string
/** Competing native tab closed even when application setup fails. */
let peer: Awaited<ReturnType<typeof openFocusPeer>> | undefined

test.beforeEach(async ({ page }) => {
  session = randomUUID()
  peer = undefined
  await page.goto('/test/browser/fixtures/index.html')
})
test.afterEach(async ({ page, request }) => {
  const released = await Promise.allSettled([
    callMultiplayer(page, 'dispose'),
    request.post(relayURL(session, 'dispose')),
    peer?.close(),
  ])
  const errors = released.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
  if (errors.length)
    throw new AggregateError(errors, 'Multiplayer focus resources failed to close')
})

test('native blur clears peer focus even after document loses focus', async ({ page, context }) => {
  await mountMultiplayerPair(page, session)
  peer = await openFocusPeer(page, context)
  await returnToApplication(page)
  const input = page.locator('[data-editor="alice"] [data-field="title"]')
  await input.focus()
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'bob')).peers[0]?.field).toBe('title')
  await leaveApplication(page, peer)
  await input.evaluate(element => (element as HTMLInputElement).blur())
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'bob')).peers[0]?.field).toBeNull()
})
