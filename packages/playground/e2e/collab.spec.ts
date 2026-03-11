import { expect, test } from '@playwright/test'
import { uniqueText } from './utils'

test('shows seeded collaborative documents on the collab index', async ({ page }) => {
  await page.goto('/collab')

  await expect(page.getByText('Collaborative Documents', { exact: true })).toBeVisible()
  await expect(page.locator('a[href="/collab/doc1"]')).toBeVisible()
  await expect(page.locator('a[href="/collab/doc2"]')).toBeVisible()
})

test('syncs presence and content updates between two collab editors', async ({ page, browser }) => {
  const editorUrl = '/collab/doc1'
  await page.goto(editorUrl)
  await expect(page).toHaveURL(/\/collab\/doc1$/)

  const secondEditor = await browser.newPage()
  await secondEditor.goto(editorUrl)

  await expect(page.getByText(/No other editors/)).toHaveCount(0)
  await expect(secondEditor.getByText(/No other editors/)).toHaveCount(0)

  const firstEditorTitle = page.getByPlaceholder('Document title')
  const secondEditorTitle = secondEditor.getByPlaceholder('Document title')
  const firstEditorBody = page.getByPlaceholder('Write your content here...')
  const secondEditorBody = secondEditor.getByPlaceholder('Write your content here...')

  await firstEditorTitle.click()
  await expect(secondEditor.getByText(/editing title/)).toBeVisible()

  const syncedTitle = uniqueText('title')
  await firstEditorTitle.fill(syncedTitle)
  await expect(secondEditorTitle).toHaveValue(syncedTitle)

  const syncedBody = uniqueText('body')
  await firstEditorBody.fill(syncedBody)
  await expect(secondEditorBody).toHaveValue(syncedBody)

  await secondEditor.close()
})
