import type { Page } from '@playwright/test'

/** Call a browser fixture export after loading it through the source-serving Vite harness. */
export async function callOffline(page: Page, name: string, method: string, argument?: unknown): Promise<any> {
  return page.evaluate(async ({ url, method, argument }) => {
    const fixture = await import(/* @vite-ignore */ url)
    return fixture[method](argument)
  }, { url: `/test/browser/fixtures/${name}.ts`, method, argument })
}
