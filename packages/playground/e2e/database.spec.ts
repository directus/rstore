import { expect, test } from '@playwright/test'

test('navigates through database source and collection', async ({ page }) => {
  await page.goto('/database')

  await expect(page.getByText('Data Sources')).toBeVisible()
  await page.getByText('My DB', { exact: true }).click()

  await expect(page).toHaveURL(/\/database\/source1$/)
  await expect(page.getByText('Collections')).toBeVisible()

  await page.getByText('Posts', { exact: true }).click()

  await expect(page).toHaveURL(/\/database\/source1\/collection1$/)
  await expect(page.getByText('TITLE', { exact: true })).toBeVisible()
  await expect(page.getByText('CONTENT', { exact: true })).toBeVisible()
  await expect(page.getByText('PUBLISHED', { exact: true })).toBeVisible()
})
