import { expect, test } from '@playwright/test'

test('shows seeded collaborative documents on collab index', async ({ page }) => {
  await page.goto('/collab')

  await expect(page.getByText('Collaborative Documents', { exact: true })).toBeVisible()
  await expect(page.locator('a[href="/collab/doc1"]')).toBeVisible()
  await expect(page.locator('a[href="/collab/doc2"]')).toBeVisible()
})
