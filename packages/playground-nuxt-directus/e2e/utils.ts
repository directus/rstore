import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Creates a unique test label with a stable prefix.
 */
export function uniqueText(prefix: string) {
  return `${prefix}-${Date.now()}`
}

/**
 * Escapes arbitrary text for use inside an exact-match regular expression.
 */
function toExactTextRegex(text: string) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^\\s*${escaped}\\s*$`)
}

/**
 * Returns the rendered todo row that owns the given title.
 */
export function todoByTitle(page: Page, title: string) {
  return page.locator('.todo').filter({
    has: page.locator('span.flex-1', { hasText: toExactTextRegex(title) }),
  })
}

/**
 * Creates a todo through the playground form and waits for it to render.
 */
export async function createTodo(page: Page, text: string) {
  const input = page.getByPlaceholder('What needs to be done?')
  await expect(input).toBeVisible()
  await input.fill(text)
  await expect(input).toHaveValue(text)
  await input.press('Enter')
  await expect(todoByTitle(page, text)).toBeVisible()
  await expect(input).toHaveValue('')
}
