import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export function uniqueText(prefix: string) {
  return `${prefix}-${Date.now()}`
}

export async function openLoginPopover(page: Page) {
  await page.getByRole('button', { name: 'Login', exact: true }).first().click()
  await expect(page.getByPlaceholder('Email')).toBeVisible()
  await expect(page.getByPlaceholder('Password')).toBeVisible()
}

export async function submitLoginForm(page: Page) {
  const emailInput = page.getByPlaceholder('Email')
  const form = emailInput.locator('xpath=ancestor::form[1]')
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/api/auth/login') && response.request().method() === 'POST'),
    form.getByRole('button', { name: 'Login', exact: true }).click(),
  ])
}
