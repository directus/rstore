import type { Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { expect } from '@playwright/test'

/** Creates a readable, worker-safe Todo label for browser tests. */
export function uniqueText(prefix: string): string {
  return `${prefix}-${randomUUID()}`
}

/** Escapes arbitrary text for an exact text-matching regular expression. */
function toExactTextRegex(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^\\s*${escaped}\\s*$`)
}

/** Finds a rendered Todo row by its exact title. */
export function todoByTitle(page: Page, title: string) {
  return page.locator('.todo').filter({
    has: page.locator('span.flex-1', { hasText: toExactTextRegex(title) }),
  })
}

/** Finds all rendered Todo titles that begin with a known test prefix. */
export function todoTitlesByPrefix(page: Page, prefix: string) {
  return page.locator('.todo span.flex-1', { hasText: `${prefix}-` })
}

/** Creates a Todo through the shared playground form and waits for its row. */
export async function createTodo(page: Page, text: string): Promise<void> {
  const input = page.getByPlaceholder('What needs to be done?')
  await expect(input).toBeVisible()
  await input.fill(text)
  await expect(input).toHaveValue(text)
  await input.press('Enter')
  await expect(todoByTitle(page, text)).toBeVisible()
  await expect(input).toHaveValue('')
}
