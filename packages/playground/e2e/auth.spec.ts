import { expect, test } from '@playwright/test'
import { openLoginPopover, submitLoginForm } from './utils'

test('shows an error for invalid credentials', async ({ page }) => {
  await page.goto('/')
  await openLoginPopover(page)

  await page.getByPlaceholder('Password').fill('wrong-password')
  await submitLoginForm(page)

  await expect(page.getByText('Invalid username or password')).toBeVisible()
})

test('logs in and keeps the session after reload', async ({ page }) => {
  await page.goto('/')
  await openLoginPopover(page)

  await page.getByPlaceholder('Email').fill('user1@acme.com')
  await page.getByPlaceholder('Password').fill('admin')
  await submitLoginForm(page)

  await expect(page.getByText('Logged in as')).toBeVisible({ timeout: 15_000 })

  await page.reload()
  await expect(page.getByText('Logged in as')).toBeVisible({ timeout: 15_000 })
})
