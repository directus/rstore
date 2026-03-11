import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export function uniqueText(prefix: string) {
  return `${prefix}-${Date.now()}`
}

function toExactTextRegex(text: string) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^\\s*${escaped}\\s*$`)
}

export function todoByTitle(page: Page, title: string) {
  return page.locator('.todo').filter({
    has: page.locator('span.flex-1', { hasText: toExactTextRegex(title) }),
  })
}

export function todoTitlesByPrefix(page: Page, prefix: string) {
  return page.locator('.todo span.flex-1', { hasText: `${prefix}-` })
}

export async function createTodo(page: Page, text: string) {
  const input = page.getByPlaceholder('What needs to be done?')
  await expect(input).toBeVisible()
  await input.fill(text)
  await expect(input).toHaveValue(text)
  await input.press('Enter')
  await expect(todoByTitle(page, text)).toBeVisible()
  await expect(input).toHaveValue('')
}
