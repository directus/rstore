import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { callMultiplayer, mountMultiplayerPair, relayURL } from './multiplayerDriver'

/** Per-test network session isolates wire evidence and independent teardown. */
let session: string
/** Wire epoch counts after both applications acknowledge presence. */
let initialAlicePresence: number
/** Independent initial peer count for subsequent wire barrier. */
let initialBobPresence: number

test.beforeEach(async ({ page, request }) => {
  session = randomUUID()
  await page.goto('/test/browser/fixtures/index.html')
  await mountMultiplayerPair(page, session)
  const frames = (await (await request.get(relayURL(session))).json()).frames
  initialAlicePresence = frames.filter((frame: any) => frame.user?.id === 'alice').length
  initialBobPresence = frames.filter((frame: any) => frame.user?.id === 'bob').length
})
test.afterEach(async ({ page, request }) => {
  try {
    await callMultiplayer(page, 'dispose')
  }
  finally {
    await request.post(relayURL(session, 'dispose'))
  }
})

test('rapid blur/refocus cancels pending clear and keeps peer field focused', async ({ page, request }) => {
  await page.locator('[data-editor="alice"] [data-field="title"]').evaluate((element) => {
    const input = element as HTMLInputElement
    input.focus()
    input.blur()
    input.focus()
  })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'bob')).peers[0]?.field).toBe('title')
  const state = await (await request.get(relayURL(session))).json()
  const focusFrames = state.frames.filter((frame: any) => frame.user?.id === 'alice')
  expect(focusFrames.slice(initialAlicePresence).map((frame: any) => frame.field)).toEqual(['title', 'title'])
})

test('repeated blur coalesces into one peer-visible clear', async ({ page, request }) => {
  await callMultiplayer(page, 'action', 'alice', 'focus', 'title')
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'bob')).peers[0]?.field).toBe('title')
  await page.evaluate(async () => {
    const path = '/test/browser/fixtures/multiplayer.ts'
    const fixture = await import(/* @vite-ignore */ path)
    // No awaits between actions: callbacks share the same native timer turn.
    void fixture.action('alice', 'blur', 'title')
    void fixture.action('alice', 'blur', 'title')
    void fixture.action('alice', 'blur', 'title')
  })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'bob')).peers[0]?.field).toBeNull()
  const frames = (await (await request.get(relayURL(session))).json()).frames
  expect(frames.filter((frame: any) => frame.user?.id === 'alice' && frame.field === null)).toHaveLength(initialAlicePresence + 1)
})

test('blur without focus sends no additional presence', async ({ page, request }) => {
  await callMultiplayer(page, 'action', 'alice', 'blur', 'title')
  // Join is a later wire barrier after native blur timer has had a turn.
  await callMultiplayer(page, 'action', 'bob', 'join')
  await expect.poll(async () => (await (await request.get(relayURL(session))).json()).frames.filter((frame: any) => frame.user?.id === 'bob').length).toBe(initialBobPresence + 1)
  const frames = (await (await request.get(relayURL(session))).json()).frames
  expect(frames.filter((frame: any) => frame.user?.id === 'alice')).toHaveLength(initialAlicePresence)
})

test('dynamic field change rejects stale blur for previous option', async ({ page }) => {
  await callMultiplayer(page, 'action', 'alice', 'focus', 'dynamic')
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'bob')).peers[0]?.field).toBe('title')
  await callMultiplayer(page, 'action', 'alice', 'dynamicField', 'body')
  await callMultiplayer(page, 'action', 'alice', 'blur', 'dynamic')
  await callMultiplayer(page, 'action', 'bob', 'join')
  expect((await callMultiplayer(page, 'snapshot', 'bob')).peers[0]?.field).toBe('title')
})

test('moving focus between fields keeps new field visible to peers', async ({ page }) => {
  await page.locator('[data-editor="alice"] [data-field="title"]').focus()
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'bob')).peers[0]?.field).toBe('title')
  await page.locator('[data-editor="alice"] [data-field="body"]').focus()
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'bob')).peers[0]?.field).toBe('body')
  // A later server frame confirms stale native blur work settled, rather than
  // accepting an optimistic body presence before delayed clear runs.
  await callMultiplayer(page, 'action', 'bob', 'join')
  expect((await callMultiplayer(page, 'snapshot', 'bob')).peers[0]?.field).toBe('body')
})
