import { expect, test } from '@playwright/test'
import { createTodo, todoByTitle, uniqueText } from './utils'

test('can create and filter todos', async ({ page }) => {
  const todoText = uniqueText('playwright-drizzle')

  await page.goto('/')
  await createTodo(page, todoText)

  const todoItem = todoByTitle(page, todoText)
  await expect(todoItem).toBeVisible()

  await page.getByRole('button', { name: 'Unfinished', exact: true }).click()
  await expect(todoItem).toBeVisible()

  await page.getByRole('button', { name: 'All', exact: true }).click()
  await todoItem.click()

  await page.getByRole('button', { name: 'Unfinished', exact: true }).click()
  await expect(todoItem).toHaveCount(0)

  await page.getByRole('button', { name: 'Finished', exact: true }).click()
  await expect(todoByTitle(page, todoText)).toBeVisible()
})

test('can edit a todo title', async ({ page }) => {
  const originalText = uniqueText('playwright-drizzle-edit')
  const editedText = `${originalText}-updated`

  await page.goto('/')
  await createTodo(page, originalText)

  const todoItem = todoByTitle(page, originalText)
  await todoItem.locator('button').first().click()

  const editInput = page.getByRole('textbox', { name: 'Text', exact: true })
  await expect(editInput).toBeVisible()
  await editInput.fill(editedText)
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(todoByTitle(page, editedText)).toBeVisible()
  await expect(todoByTitle(page, originalText)).toHaveCount(0)
})

test('can delete a todo', async ({ page }) => {
  const todoText = uniqueText('playwright-drizzle-delete')

  await page.goto('/')
  await createTodo(page, todoText)

  await todoByTitle(page, todoText).locator('button').last().click()
  await expect(todoByTitle(page, todoText)).toHaveCount(0)
})

test('can create multiple todos in sequence', async ({ page }) => {
  const todoTextA = uniqueText('playwright-drizzle-seq-a')
  const todoTextB = uniqueText('playwright-drizzle-seq-b')

  await page.goto('/')

  await createTodo(page, todoTextA)
  await createTodo(page, todoTextB)

  await expect(todoByTitle(page, todoTextA)).toBeVisible()
  await expect(todoByTitle(page, todoTextB)).toBeVisible()
})
