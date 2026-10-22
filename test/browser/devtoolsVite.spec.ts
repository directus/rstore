import { expect, test } from '@playwright/test'
import { createRstoreDevtools } from '../../packages/devtools/src/runtime'
import { startRelay } from '../../packages/devtools/test/utils/relay'
import { callDevtools, createInspectorPanel, selectInspectorStore } from './devtoolsDriver'

test('Vite-mounted built inspector loads base-relative assets and negotiates parent channel', async ({ page }) => {
  await page.goto('/test/browser/fixtures/index.html')
  await callDevtools(page, 'initialize')
  try {
    const frame = await createInspectorPanel(page, 'vite-inspector')
    await expect(frame.getByRole('heading', { name: 'rstore', exact: true })).toBeVisible()
    await expect(frame.getByRole('combobox', { name: 'Session and store', exact: true })).toHaveValue('0')
    await expect(frame.getByRole('heading', { name: 'todos', exact: true })).toBeVisible()
    await expect(frame.getByRole('status').first()).toContainText('Live')
    await frame.getByRole('button', { name: 'Cache', exact: true }).click()
    await expect(frame.getByText('"core row"', { exact: true })).toBeVisible()
    await expect(frame.getByText('Disconnected', { exact: true })).toHaveCount(0)
  }
  finally { await callDevtools(page, 'dispose') }
})

test('CLI magic-open URL authenticates built inspector in memory and removes single-use fragment', async ({ page }) => {
  const { createStore } = await import('@rstore/vue')
  const store = await createStore({ schema: [{ name: 'todos' }], plugins: [], tombstoneGc: false, isServer: true })
  const runtime = createRstoreDevtools({ kind: 'node', label: 'CLI producer' })
  let host: Awaited<ReturnType<typeof startRelay>> | undefined
  try {
    runtime.attachStore(store, { id: 'cli-store' })
    store.$cache.writeItem({ collection: store.$collections[0]!, key: 'magic', item: { id: 'magic', title: 'Magic link row' } })
    host = await startRelay({ runtime, serveClient: true })
    await page.goto(host.openURL())
    await expect(page.getByRole('heading', { name: 'todos', exact: true })).toBeVisible()
    await expect(page.getByRole('status').first()).toContainText('Live')
    await page.getByRole('button', { name: 'Cache', exact: true }).click()
    await expect(page.getByText('"Magic link row"', { exact: true })).toBeVisible()
    expect(new URL(page.url()).hash).toBe('')
    expect(await page.evaluate(() => localStorage.getItem('__DEVFRAME_CONNECTION_AUTH_TOKEN__'))).toBeNull()
  }
  finally {
    await host?.close()
    runtime.dispose()
    store.$cache.dispose?.()
  }
})

test('retained SSR inspector reads disposed producer and exposes failed request without store authority', async ({ page }) => {
  const { createStore } = await import('@rstore/vue')
  const { captureSSRSnapshot, createSSRWorker } = await import('@rstore/devtools/node')
  const store = await createStore({ schema: [{ name: 'todos' }], plugins: [], tombstoneGc: false, isServer: true })
  const completed = createRstoreDevtools({ kind: 'ssr', label: 'GET /recorded' })
  const failed = createRstoreDevtools({ kind: 'ssr', label: 'GET /failed' })
  const host = await startRelay({ serveClient: true })
  const worker = createSSRWorker({ baseURL: host.baseURL, authToken: host.ssrToken })
  try {
    completed.attachStore(store, { id: 'recorded-store', label: 'Recorded store' })
    store.$cache.writeItem({ collection: store.$collections[0]!, key: 'recorded', item: { title: 'Captured SSR row' } })
    const timing = { method: 'GET', startedAt: Date.now() - 10, completedAt: Date.now() }
    worker.complete(captureSSRSnapshot(completed, { ...timing, path: '/recorded?private=removed', status: 'completed' }))
    worker.complete(captureSSRSnapshot(failed, { ...timing, path: '/failed', status: 'error', error: new Error('Store initialization failed') }))
    completed.dispose()
    failed.dispose()
    await page.goto(host.baseURL)
    await page.getByLabel('Auth token', { exact: true }).fill(host.viewerToken)
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    const selector = page.getByRole('combobox', { name: 'Session and store', exact: true })
    await expect(selector.getByRole('option', { name: 'GET /recorded / Recorded store · SSR', exact: true })).toHaveCount(1)
    await selector.selectOption({ label: 'GET /recorded / Recorded store · SSR' })
    await expect(page.getByRole('status').first()).toContainText('Recorded · completed · read-only')
    await expect(page.getByRole('heading', { name: 'GET /recorded', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create item', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Cache', exact: true }).click()
    await expect(page.getByText('"Captured SSR row"', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Write item', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'History', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Clear history', exact: true })).toBeDisabled()
    await selector.selectOption({ label: 'GET /failed · SSR' })
    await expect(page.getByRole('status').first()).toContainText('Recorded · error · read-only')
    await expect(page.getByRole('heading', { name: 'GET /failed', exact: true })).toBeVisible()
    await expect(page.getByText('Error: Store initialization failed', { exact: true })).toBeVisible()
    await expect(page.getByText('No captured stores', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Write item', exact: true })).toHaveCount(0)
  }
  finally {
    worker.dispose()
    completed.dispose()
    failed.dispose()
    store.$cache.dispose?.()
    await host.close()
  }
})

test('standalone viewer on separate origin discovers authenticated relay without persisting credentials', async ({ page, context }) => {
  await page.goto('/test/browser/fixtures/index.html')
  await callDevtools(page, 'initialize', { relay: true })
  const baseURL = new URL('/__rstore/', page.url()).href
  const bootstrap = await page.request.get(new URL('bootstrap.json', baseURL).href).then(response => response.json())
  const viewerURL = new URL(baseURL)
  viewerURL.hostname = 'localhost'
  const viewer = await context.newPage()
  const socketURLs: string[] = []
  viewer.on('websocket', socket => socketURLs.push(socket.url()))
  try {
    await viewer.goto(viewerURL.href)
    await viewer.getByRole('textbox', { name: 'Relay URL', exact: true }).fill(baseURL)
    await viewer.getByLabel('Auth token', { exact: true }).fill(bootstrap.authToken)
    await viewer.getByRole('button', { name: 'Connect', exact: true }).click()
    await expect(viewer.getByRole('heading', { name: 'todos', exact: true })).toBeVisible()
    await viewer.getByRole('button', { name: 'Cache', exact: true }).click()
    await expect(viewer.getByText('"core row"', { exact: true })).toBeVisible()
    const frame = viewer.mainFrame()
    await selectInspectorStore(frame, 'vue')
    await expect(viewer.getByText('"vue row"', { exact: true })).toBeVisible()
    expect(await viewer.evaluate(() => localStorage.getItem('__DEVFRAME_CONNECTION_AUTH_TOKEN__'))).toBeNull()
    expect(socketURLs.length).toBeGreaterThan(0)
    expect(socketURLs.some(url => url.includes(bootstrap.authToken))).toBe(false)
  }
  finally {
    await viewer.close()
    await callDevtools(page, 'dispose')
  }
})
