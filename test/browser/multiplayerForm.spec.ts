import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { callMultiplayer, mountMultiplayerPair, relayURL } from './multiplayerDriver'

/** Independent external relay session. */
let session: string

test.beforeEach(async ({ page }) => {
  session = randomUUID()
  await page.goto('/test/browser/fixtures/index.html')
})
test.afterEach(async ({ page, request }) => {
  try {
    await callMultiplayer(page, 'dispose')
  }
  finally {
    await request.post(relayURL(session, 'dispose'))
  }
})

for (const tracked of [true, false]) {
  test(`sanitizes incoming updates through real form and published base, tracked=${tracked}`, async ({ page, request }) => {
    await callMultiplayer(page, 'mount', { id: 'alice', session, tracked })
    await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).status).toBe('OPEN')
    const data = JSON.parse('{"title":"remote title","body":"remote body","isAdmin":true,"__proto__":{"polluted":true},"constructor":{"bad":1},"prototype":{}}')
    await request.post(relayURL(session, 'send'), { data: JSON.stringify({ type: 'multiplayer:update', roomId: 'room', userId: 'hostile', clientId: 'hostile-tab', data }) })
    await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).form.title).toBe('remote title')
    const state = await callMultiplayer(page, 'snapshot', 'alice')
    expect(state.form).toEqual({ title: 'remote title', body: 'remote body', isAdmin: !tracked })
    expect(state.base).toEqual({ title: 'remote title', body: 'remote body', isAdmin: !tracked })
    expect(state.baseKeys).toEqual(['body', 'isAdmin', 'title'])
    expect(state.remoteUpdateKeys).toEqual(['__proto__', 'body', 'constructor', 'isAdmin', 'prototype', 'title'])
    expect(state.polluted).toBeUndefined()
    expect(state.conflicts).toEqual([])
  })
}

test('untracked-only hostile update leaves populated base and local edit usable', async ({ page, request }) => {
  await callMultiplayer(page, 'mount', { id: 'alice', session })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).status).toBe('OPEN')
  await callMultiplayer(page, 'action', 'alice', 'edit', { title: 'local title' })
  const data = JSON.parse('{"isAdmin":true,"__proto__":{"polluted":true}}')
  await request.post(relayURL(session, 'send'), { data: JSON.stringify({ type: 'multiplayer:update', roomId: 'room', userId: 'hostile', clientId: 'hostile-tab', data }) })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).remoteUpdate).toEqual({ isAdmin: true })
  const state = await callMultiplayer(page, 'snapshot', 'alice')
  expect(state.form).toEqual({ title: 'local title', body: 'Hello world', isAdmin: false })
  expect(state.base).toEqual({ title: 'old', body: 'Hello world', isAdmin: false })
  expect(state.baseKeys).toEqual(['body', 'isAdmin', 'title'])
  expect(state.remoteUpdateKeys).toEqual(['__proto__', 'isAdmin'])
  expect(state.polluted).toBeUndefined()
  await callMultiplayer(page, 'action', 'alice', 'undo')
  expect((await callMultiplayer(page, 'snapshot', 'alice')).form.title).toBe('old')
})

for (const tracked of [true, false]) {
  test(`two real forms converge for edits, undo and redo without duplicate broadcasts, tracked=${tracked}`, async ({ page, request }) => {
    await mountMultiplayerPair(page, session, tracked)
    await callMultiplayer(page, 'action', 'alice', 'edit', { title: 'edited title', body: 'edited body' })
    await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'bob')).form).toEqual({ title: 'edited title', body: 'edited body', isAdmin: false })
    const updates = (await (await request.get(relayURL(session))).json()).frames.filter((frame: any) => frame.type === 'multiplayer:update')
    expect(updates).toHaveLength(1)
    expect(updates[0].data).toEqual({ title: 'edited title', body: 'edited body' })
    await callMultiplayer(page, 'action', 'alice', 'undo')
    await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'bob')).form.body).toBe('Hello world')
    expect((await callMultiplayer(page, 'snapshot', 'bob')).form.title).toBe('edited title')
    await callMultiplayer(page, 'action', 'alice', 'redo')
    await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'bob')).form).toEqual({ title: 'edited title', body: 'edited body', isAdmin: false })
    const finalUpdates = (await (await request.get(relayURL(session))).json()).frames.filter((frame: any) => frame.type === 'multiplayer:update')
    const untrackedState = tracked ? {} : { isAdmin: false }
    expect(finalUpdates.map((frame: any) => frame.data)).toEqual([
      { title: 'edited title', body: 'edited body' },
      { title: 'edited title', body: 'Hello world', ...untrackedState },
      { title: 'edited title', body: 'edited body', ...untrackedState },
    ])
  })
}

test('unmounting form subscriber stops retained edits while shared channel stays open', async ({ page, request }) => {
  await mountMultiplayerPair(page, session)
  await callMultiplayer(page, 'action', 'alice', 'detachSync')
  await callMultiplayer(page, 'action', 'alice', 'edit', { title: 'detached edit' })
  await callMultiplayer(page, 'action', 'bob', 'edit', { body: 'live body' })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).remoteUpdate).toEqual({ body: 'live body' })
  expect((await callMultiplayer(page, 'snapshot', 'alice')).form).toEqual({ title: 'detached edit', body: 'Hello world', isAdmin: false })
  expect((await callMultiplayer(page, 'snapshot', 'bob')).form).toEqual({ title: 'old', body: 'live body', isAdmin: false })
  const state = await (await request.get(relayURL(session))).json()
  expect(state.open).toBe(2)
  expect(state.frames.filter((frame: any) => frame.type === 'multiplayer:update').map((frame: any) => frame.data)).toEqual([{ body: 'live body' }])
})

test('queued undo cannot publish after form subscriber ends while channel remains usable', async ({ page, request }) => {
  await mountMultiplayerPair(page, session)
  await callMultiplayer(page, 'action', 'alice', 'edit', { title: 'first title', body: 'first body' })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'bob')).form).toEqual({ title: 'first title', body: 'first body', isAdmin: false })
  await page.evaluate(async () => {
    const path = '/test/browser/fixtures/multiplayer.ts'
    const fixture = await import(/* @vite-ignore */ path)
    // Undo queues actual form notifications. End child ownership in same turn
    // before synchronization resumes; shared channel owner stays mounted.
    const undo = fixture.action('alice', 'undo')
    const detach = fixture.action('alice', 'detachSync')
    await Promise.all([undo, detach])
  })
  expect((await callMultiplayer(page, 'snapshot', 'alice')).form).toEqual({ title: 'first title', body: 'Hello world', isAdmin: false })
  await callMultiplayer(page, 'action', 'bob', 'edit', { title: 'live title' })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).remoteUpdate).toEqual({ title: 'live title' })
  expect((await callMultiplayer(page, 'snapshot', 'bob')).form).toEqual({ title: 'live title', body: 'first body', isAdmin: false })
  const state = await (await request.get(relayURL(session))).json()
  expect(state.open).toBe(2)
  expect(state.frames.filter((frame: any) => frame.type === 'multiplayer:update').map((frame: any) => frame.data)).toEqual([
    { title: 'first title', body: 'first body' },
    { title: 'live title' },
  ])
})

test('disjoint edits converge without rebroadcasting remaining local operations', async ({ page, request }) => {
  await mountMultiplayerPair(page, session)
  await callMultiplayer(page, 'action', 'alice', 'edit', { title: 'Alice title' })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'bob')).form.title).toBe('Alice title')
  await callMultiplayer(page, 'action', 'bob', 'edit', { body: 'Bob body' })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).form).toEqual({ title: 'Alice title', body: 'Bob body', isAdmin: false })
  expect((await callMultiplayer(page, 'snapshot', 'bob')).form).toEqual({ title: 'Alice title', body: 'Bob body', isAdmin: false })
  // Each join follows this channel's queued rebase work on the same socket.
  // Wait for both recorded barriers before asserting absence of echo updates.
  const initial = (await (await request.get(relayURL(session))).json()).frames.filter((frame: any) => frame.type === 'multiplayer:presence').length
  await callMultiplayer(page, 'action', 'alice', 'join')
  await callMultiplayer(page, 'action', 'bob', 'join')
  await expect.poll(async () => (await (await request.get(relayURL(session))).json()).frames.filter((frame: any) => frame.type === 'multiplayer:presence').length).toBe(initial + 2)
  const updates = (await (await request.get(relayURL(session))).json()).frames.filter((frame: any) => frame.type === 'multiplayer:update')
  expect(updates.map((frame: any) => ({ userId: frame.userId, data: frame.data }))).toEqual([
    { userId: 'alice', data: { title: 'Alice title' } },
    { userId: 'bob', data: { body: 'Bob body' } },
  ])
})
