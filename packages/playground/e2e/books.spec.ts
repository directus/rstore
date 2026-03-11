import { expect, test } from '@playwright/test'

test('shows paginated books total count', async ({ page }) => {
  await page.goto('/books')
  await expect(page.getByText('Total count: 5000', { exact: true })).toBeVisible()
})

test('shows all-books total count', async ({ page }) => {
  await page.goto('/books/all')
  await expect(page.getByText('Total count: 5000', { exact: true })).toBeVisible()
})
