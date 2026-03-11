import { expect, test } from '@playwright/test'

test('sending a message updates the sent tab', async ({ page }) => {
  await page.goto('/messages/cache')

  await page.getByRole('tab', { name: 'Sent', exact: true }).click()
  const sentMessages = page.locator('button:visible:has-text("Update text")')
  const beforeCount = await sentMessages.count()

  await page.getByRole('button', { name: 'Send message', exact: true }).click()

  await expect.poll(async () => sentMessages.count()).toBe(beforeCount + 1)
})

test('receiving a message updates the received tab', async ({ page }) => {
  await page.goto('/messages/cache')

  await page.getByRole('tab', { name: 'Received', exact: true }).click()
  const receivedMessages = page.locator('button:visible:has-text("Update text")')
  const beforeCount = await receivedMessages.count()

  await page.getByRole('button', { name: 'Receive message', exact: true }).click()

  await expect.poll(async () => receivedMessages.count()).toBe(beforeCount + 1)
})
