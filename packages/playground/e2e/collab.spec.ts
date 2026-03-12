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

test('keeps the focused caret position when another editor inserts text before it', async ({ page, browser }) => {
  const editorUrl = '/collab/doc1'
  await page.goto(editorUrl)

  const secondEditor = await browser.newPage()
  await secondEditor.goto(editorUrl)

  const firstEditorBody = page.getByPlaceholder('Write your content here...')
  const secondEditorBody = secondEditor.getByPlaceholder('Write your content here...')
  const baseText = uniqueText('cursor-base')

  await firstEditorBody.fill(baseText)
  await expect(secondEditorBody).toHaveValue(baseText)

  const cursorIndex = 8
  await secondEditorBody.evaluate((element, nextCursorIndex) => {
    const target = element as HTMLTextAreaElement
    target.focus()
    target.setSelectionRange(nextCursorIndex, nextCursorIndex, 'none')
    target.dispatchEvent(new Event('select', { bubbles: true }))
  }, cursorIndex)

  const prefix = `${uniqueText('prefix')}-`
  await firstEditorBody.evaluate((element) => {
    const target = element as HTMLTextAreaElement
    target.focus()
    target.setSelectionRange(0, 0, 'none')
  })
  await firstEditorBody.type(prefix)

  await expect(secondEditorBody).toHaveValue(`${prefix}${baseText}`)
  await expect.poll(async () => secondEditorBody.evaluate((element) => {
    const target = element as HTMLTextAreaElement
    return {
      start: target.selectionStart,
      end: target.selectionEnd,
    }
  })).toEqual({
    start: cursorIndex + prefix.length,
    end: cursorIndex + prefix.length,
  })

  await secondEditor.close()
})
