import { expect, test } from '@playwright/test'

test('renders layer controls on the todo layers page', async ({ page }) => {
  await page.goto('/todo/layers')

  await expect(page.getByRole('button', { name: 'Add a layer that adds a todo', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add a layer that modifies the first todo', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add a layer that deletes the first todo', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add a skipped layer that adds a todo (will not be applied)', exact: true })).toBeVisible()
})

test('shows empty todo state on the layers page by default', async ({ page }) => {
  await page.goto('/todo/layers')
  await expect(page.getByText('Nothing here yet', { exact: true })).toBeVisible()
  await expect(page.getByText('0 items', { exact: true })).toBeVisible()
})
