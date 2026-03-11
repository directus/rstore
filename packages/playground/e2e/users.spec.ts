import { expect, test } from '@playwright/test'

test('loads seeded users on the users page', async ({ page }) => {
  await page.goto('/users')

  await expect(page.getByText('user1@acme.com').first()).toBeVisible()
  await expect(page.getByText('user2@acme.com').first()).toBeVisible()
  await expect(page.getByText('user3@acme.com').first()).toBeVisible()
})

test('filters users with the many filter page', async ({ page }) => {
  await page.goto('/users/filter')

  const filterInput = page.getByRole('textbox')
  await expect(filterInput).toBeVisible()
  await filterInput.fill('user2@acme.com')

  await expect(page.getByText('user2@acme.com').first()).toBeVisible()
  await expect(page.getByText('user1@acme.com')).toHaveCount(0)
})
