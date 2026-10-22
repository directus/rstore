import { expect, test } from '@playwright/test'
import { callDevtools, createDevtoolsPanel } from './devtoolsDriver'

test.beforeEach(async ({ page }) => {
  await page.goto('/test/browser/fixtures/index.html')
})
test.afterEach(async ({ page }) => {
  await callDevtools(page, 'dispose')
})

test('same-origin iframe reads Core/Vue stores and mutates exact cache target without relay', async ({ page }) => {
  const relayRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/__rpc') || request.url().includes('/__devframe'))
      relayRequests.push(request.url())
  })
  const [core, vue] = await callDevtools(page, 'initialize')
  const frame = await createDevtoolsPanel(page)
  await callDevtools(frame, 'connect')
  const sessions = await callDevtools(frame, 'read', { method: 'rstore:list-sessions' })
  expect(sessions[0].stores.map((store: any) => store.target.storeId)).toEqual(['core', 'vue'])
  const result = await callDevtools(frame, 'execute', {
    target: core,
    action: 'write-cache-item',
    commandId: 'browser-write',
    issuedAt: Date.now(),
    collection: 'todos',
    item: { id: 0, title: 'iframe row' },
  })
  expect(result.status).toBe('completed')
  const cache = await callDevtools(frame, 'read', { method: 'rstore:get-cache', target: core, collection: 'todos' })
  expect(cache.data.rows.map((row: any) => row.key)).toEqual([0, 'core'])
  const untouched = await callDevtools(frame, 'read', { method: 'rstore:get-cache', target: vue, collection: 'todos' })
  expect(untouched.data.rows).toEqual([{ key: 'vue', value: { kind: 'object', entries: [['id', 'vue'], ['title', 'vue row']] } }])
  expect(relayRequests).toEqual([])
  await callDevtools(frame, 'dispose')
})

test('denied origin has no usable channel while another panel retains authority', async ({ page }) => {
  const [target] = await callDevtools(page, 'initialize')
  const denied = await createDevtoolsPanel(page, 'denied')
  await expect(callDevtools(denied, 'connect', { allowedOrigins: ['https://denied.example'], timeout: 200 })).rejects.toThrow('no page script answered')
  const allowed = await createDevtoolsPanel(page, 'allowed')
  await callDevtools(allowed, 'connect')
  await callDevtools(denied, 'dispose')
  expect((await callDevtools(allowed, 'read', { method: 'rstore:get-collections', target })).target).toEqual(target)
  await callDevtools(allowed, 'dispose')
})

test('Vue module lease publishes changes, panel close preserves another, replacement fences old target', async ({ page }) => {
  const [core, vue] = await callDevtools(page, 'initialize')
  const first = await createDevtoolsPanel(page, 'first')
  const second = await createDevtoolsPanel(page, 'second')
  await callDevtools(first, 'connect')
  await callDevtools(second, 'connect')
  await callDevtools(second, 'watch', { target: vue, view: 'modules' })
  await callDevtools(page, 'changeModule', 7)
  await expect.poll(async () => (await callDevtools(second, 'getNotifications')).filter((event: any) => event.target?.storeId === 'vue' && event.view === 'modules').length).toBe(1)
  await callDevtools(first, 'dispose')
  const replacement = await callDevtools(page, 'replaceCore')
  await expect.poll(async () => (await callDevtools(second, 'getNotifications'))
    .filter((event: any) => event.view === 'registry'))
    .toEqual([{ view: 'registry', revision: 3 }, { view: 'registry', revision: 4 }])
  expect(replacement.generation).toBeGreaterThan(core.generation)
  await expect(callDevtools(second, 'read', { method: 'rstore:get-collections', target: core })).rejects.toThrow('generation')
  expect((await callDevtools(second, 'read', { method: 'rstore:get-collections', target: replacement })).target).toEqual(replacement)
  await callDevtools(second, 'dispose')
  await callDevtools(page, 'changeModule', 8)
  expect(await callDevtools(second, 'getNotifications')).toEqual([])
})
