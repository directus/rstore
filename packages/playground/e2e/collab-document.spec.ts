import { expect, test } from '@playwright/test'

/** Opens the collab document page and waits for the editor. */
async function openDoc(page: import('@playwright/test').Page, docId: string) {
  await page.goto(`/doc/${docId}`)
  const editor = page.getByTestId('collab-editor').locator('.ProseMirror')
  await expect(editor).toBeVisible()
  return editor
}

test('two tabs edit the same collab document and both mirror its blocks in the cache', async ({ browser }) => {
  const docId = `e2e-${Date.now()}`
  const first = await browser.newPage()
  const second = await browser.newPage()
  const editorA = await openDoc(first, docId)
  const editorB = await openDoc(second, docId)

  await editorA.click()
  await first.keyboard.type('Hello')
  await expect(editorB).toHaveText('Hello')

  // Concurrent typing in the same paragraph (start and end) converges.
  await editorB.click()
  await second.keyboard.press('Home')
  await Promise.all([
    first.keyboard.type(' from A'),
    second.keyboard.type('B says '),
  ])
  await expect(first.getByTestId('collab-status')).toHaveText('synchronized')
  await expect(second.getByTestId('collab-status')).toHaveText('synchronized')
  await expect(editorA).toHaveText('B says Hello from A')
  await expect(editorB).toHaveText('B says Hello from A')

  // A split is a new block row in both caches.
  await editorA.click()
  await first.keyboard.press('End')
  await first.keyboard.press('Enter')
  await first.keyboard.type('Second line')
  await expect(first.getByTestId('collab-blocks')).toHaveText('2 blocks')
  await expect(second.getByTestId('collab-blocks')).toHaveText('2 blocks')
  await expect(editorB.locator('p')).toHaveCount(2)
  await expect(editorB.locator('p').nth(1)).toHaveText('Second line')

  // A reload loads the document from the sequencer.
  await second.reload()
  const reloaded = second.getByTestId('collab-editor').locator('.ProseMirror')
  await expect(reloaded.locator('p').nth(1)).toHaveText('Second line')
})
