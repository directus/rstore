import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { callMultiplayer, relayURL } from './multiplayerDriver'

/** Isolated native relay session per scenario. */
let session: string

test.beforeEach(async ({ page }) => {
  session = randomUUID()
  await page.goto('/test/browser/fixtures/index.html')
  await callMultiplayer(page, 'mount', { id: 'alice', session, userId: 'alice' })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).status).toBe('OPEN')
})
test.afterEach(async ({ page, request }) => {
  try {
    await callMultiplayer(page, 'dispose')
  }
  finally {
    await request.post(relayURL(session, 'dispose'))
  }
})

/** Literal remote presence; matching repeats exercise every native onMessage. */
function presence(clientId: string, userId = 'bob', roomId = 'room') {
  return { type: 'multiplayer:presence', roomId, clientId, user: { id: userId, name: userId, color: '#fff' } }
}

test('same-user tabs converge, reject self echoes and stamp outgoing clientId', async ({ page, request }) => {
  await callMultiplayer(page, 'mount', { id: 'sibling', session, userId: 'alice' })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).peers.length).toBe(1)
  await callMultiplayer(page, 'action', 'alice', 'join')
  const alice = await callMultiplayer(page, 'snapshot', 'alice')
  const sibling = await callMultiplayer(page, 'snapshot', 'sibling')
  expect(alice.peers.map((peer: any) => peer.clientId)).toEqual([sibling.clientId])
  expect(alice.peers[0].id).toBe('alice')
  await callMultiplayer(page, 'action', 'sibling', 'edit', { title: 'sibling edit' })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).form.title).toBe('sibling edit')
  const frames = (await (await request.get(relayURL(session))).json()).frames
  expect(frames).toContainEqual({
    type: 'multiplayer:update',
    roomId: 'room',
    userId: 'alice',
    clientId: sibling.clientId,
    data: { title: 'sibling edit' },
  })
  expect((await callMultiplayer(page, 'snapshot', 'sibling')).remoteUpdate).toBeNull()
  expect(frames).toContainEqual({
    type: 'multiplayer:presence',
    roomId: 'room',
    clientId: alice.clientId,
    user: { id: 'alice', name: 'alice', color: '#123456' },
    field: null,
    cursor: null,
  })
})

test('tracks separate connections, aggregates users and removes only departing connection', async ({ page, request }) => {
  await request.post(relayURL(session, 'send'), { data: JSON.stringify(presence('bob-tab-1')) })
  await request.post(relayURL(session, 'send'), { data: JSON.stringify(presence('bob-tab-2')) })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).peers.map((peer: any) => peer.clientId).sort()).toEqual(['bob-tab-1', 'bob-tab-2'])
  expect((await callMultiplayer(page, 'snapshot', 'alice')).users.map((user: any) => user.id)).toEqual(['bob'])
  await request.post(relayURL(session, 'send'), { data: JSON.stringify({ type: 'multiplayer:leave', roomId: 'room', userId: 'bob', clientId: 'bob-tab-1' }) })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).peers.map((peer: any) => peer.clientId)).toEqual(['bob-tab-2'])
  expect((await callMultiplayer(page, 'snapshot', 'alice')).users.map((user: any) => user.id)).toEqual(['bob'])
})

test('ignores wrong-room presence, updates and leave without deleting existing peer', async ({ page, request }) => {
  await request.post(relayURL(session, 'send'), { data: JSON.stringify(presence('bob-tab')) })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).peers.length).toBe(1)
  for (const frame of [
    presence('denied-tab', 'denied', 'other-room'),
    { type: 'multiplayer:update', roomId: 'other-room', userId: 'bob', clientId: 'bob-tab', data: { title: 'denied' } },
    { type: 'multiplayer:leave', roomId: 'other-room', userId: 'bob', clientId: 'bob-tab' },
  ]) {
    await request.post(relayURL(session, 'send'), { data: JSON.stringify(frame) })
  }
  // Allowed update is a wire barrier after all rejected frames.
  await request.post(relayURL(session, 'send'), { data: JSON.stringify({ type: 'multiplayer:update', roomId: 'room', userId: 'bob', clientId: 'bob-tab', data: { body: 'allowed' } }) })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).form.body).toBe('allowed')
  const state = await callMultiplayer(page, 'snapshot', 'alice')
  expect(state.peers.map((peer: any) => peer.clientId)).toEqual(['bob-tab'])
  expect(state.form.title).toBe('old')
})

test('component unmount closes its native socket and stops updates while surviving peer remains usable', async ({ page, request }) => {
  await callMultiplayer(page, 'mount', { id: 'bob', session })
  await expect.poll(async () => (await (await request.get(relayURL(session))).json()).open).toBe(2)
  await callMultiplayer(page, 'action', 'alice', 'unmount')
  await expect.poll(async () => (await (await request.get(relayURL(session))).json()).open).toBe(1)
  await callMultiplayer(page, 'action', 'bob', 'edit', { title: 'after unmount' })
  await expect.poll(async () => (await (await request.get(relayURL(session))).json()).frames.filter((frame: any) => frame.type === 'multiplayer:update').length).toBe(1)
  expect((await callMultiplayer(page, 'snapshot', 'alice')).form.title).toBe('old')
  expect((await callMultiplayer(page, 'snapshot', 'bob')).form.title).toBe('after unmount')
  await callMultiplayer(page, 'action', 'bob', 'unmount')
  await expect.poll(async () => (await (await request.get(relayURL(session))).json()).open).toBe(0)
})

test('identical heartbeat frames retain live peer while absent peer expires', async ({ page, request }) => {
  test.setTimeout(35_000)
  const live = JSON.stringify(presence('live-tab'))
  await request.post(relayURL(session, 'send'), { data: live })
  await request.post(relayURL(session, 'send'), { data: JSON.stringify(presence('stale-tab', 'stale')) })
  await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).peers.length).toBe(2)
  // Real relay repeats identical data. Real client clock/sweep remain untouched.
  const pending = new Set<Promise<unknown>>()
  const failures: unknown[] = []
  const heartbeat = setInterval(() => {
    const delivery = request.post(relayURL(session, 'send'), { data: live, timeout: 2_000 })
      .catch(error => failures.push(error))
      .finally(() => pending.delete(delivery))
    pending.add(delivery)
  }, 1_000)
  try {
    await expect.poll(async () => (await callMultiplayer(page, 'snapshot', 'alice')).peers.map((peer: any) => peer.clientId), {
      timeout: 25_000,
      intervals: [250, 500, 1_000],
    }).toEqual(['live-tab'])
  }
  finally {
    clearInterval(heartbeat)
    await Promise.allSettled(pending)
  }
  expect(failures).toEqual([])
})
