import type { Frame, Page } from '@playwright/test'

/** Invoke source fixture in an actual parent page or inspector iframe. */
export function callDevtools(context: Page | Frame, method: string, argument?: unknown): Promise<any> {
  return context.evaluate(async ({ url, method, argument }) => {
    const fixture = await import(/* @vite-ignore */ url)
    return fixture[method](argument)
  }, { url: '/test/browser/fixtures/devtools.ts', method, argument })
}

/** Create separate same-origin inspector context, keeping application instrumentation in parent. */
export async function createDevtoolsPanel(page: Page, id = 'devtools-panel', src = '/test/browser/fixtures/index.html'): Promise<Frame> {
  await page.evaluate(({ id, src }) => {
    const element = document.createElement('iframe')
    element.id = id
    element.src = src
    document.body.append(element)
  }, { id, src })
  const frame = await page.locator(`#${id}`).elementHandle().then(element => element!.contentFrame())
  if (!frame)
    throw new Error('Inspector iframe missing')
  await frame.waitForLoadState()
  return frame
}

/** Open actual built inspector SPA, sharing the same frame ownership helper as channel tests. */
export async function createInspectorPanel(page: Page, id = 'inspector'): Promise<Frame> {
  const frame = await createDevtoolsPanel(page, id, '/__rstore/')
  await frame.getByRole('combobox', { name: 'Session and store' }).waitFor()
  return frame
}

/** Choose logical store by accessible option label without exposing target authority through globals. */
export async function selectInspectorStore(frame: Frame, storeId: string): Promise<void> {
  const selector = frame.getByRole('combobox', { name: 'Session and store' })
  await selector.locator('option').filter({ hasText: new RegExp(`/ ${storeId}$`) }).waitFor({ state: 'attached' })
  const label = await selector.locator('option').filter({ hasText: new RegExp(`/ ${storeId}$`) }).textContent()
  if (!label)
    throw new Error('Inspector store option missing')
  await selector.selectOption({ label })
}
