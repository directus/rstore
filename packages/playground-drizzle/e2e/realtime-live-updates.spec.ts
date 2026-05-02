import { expect, test } from '@playwright/test'
import { editTodo, framesContainUpdateFor, openRealtimeApp } from './realtime-helpers'
import { createTodo, todoByTitle, uniqueText } from './utils'

test.describe('realtime live updates', () => {
  test('cross-tab live updates: create propagates without reload', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()

    try {
      const { page: pageA } = await openRealtimeApp(ctxA)
      const { page: pageB } = await openRealtimeApp(ctxB)
      const text = uniqueText('realtime-create')

      await createTodo(pageA, text)

      await expect(todoByTitle(pageB, text)).toBeVisible({ timeout: 5_000 })
    }
    finally {
      await ctxA.close()
      await ctxB.close()
    }
  })

  test('cross-tab live updates: update propagates without reload', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()

    try {
      const { page: pageA } = await openRealtimeApp(ctxA)
      const { page: pageB } = await openRealtimeApp(ctxB)
      const originalText = uniqueText('realtime-update')
      const editedText = `${originalText}-edited`

      await createTodo(pageA, originalText)
      await expect(todoByTitle(pageB, originalText)).toBeVisible({ timeout: 5_000 })

      await editTodo(pageA, originalText, editedText)

      await expect(todoByTitle(pageB, editedText)).toBeVisible({ timeout: 5_000 })
      await expect(todoByTitle(pageB, originalText)).toHaveCount(0)
    }
    finally {
      await ctxA.close()
      await ctxB.close()
    }
  })

  test('cross-tab live updates: delete propagates without reload', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()

    try {
      const { page: pageA } = await openRealtimeApp(ctxA)
      const { page: pageB } = await openRealtimeApp(ctxB)
      const text = uniqueText('realtime-delete')

      await createTodo(pageA, text)
      await expect(todoByTitle(pageB, text)).toBeVisible({ timeout: 5_000 })

      await todoByTitle(pageA, text).locator('button').last().click()

      await expect(todoByTitle(pageB, text)).toHaveCount(0, { timeout: 5_000 })
    }
    finally {
      await ctxA.close()
      await ctxB.close()
    }
  })

  test('skip-self: originating tab does not receive its own update frame', async ({ browser }) => {
    const ctxA = await browser.newContext()
    const ctxB = await browser.newContext()

    try {
      const { page: pageA, frames: framesA } = await openRealtimeApp(ctxA)
      const { page: pageB } = await openRealtimeApp(ctxB)
      const selfText = uniqueText('realtime-skip-self')

      await createTodo(pageA, selfText)

      const otherText = uniqueText('realtime-skip-other')
      await createTodo(pageB, otherText)
      await expect(todoByTitle(pageA, otherText)).toBeVisible({ timeout: 5_000 })

      expect(framesContainUpdateFor(framesA, otherText)).toBe(true)
      expect(framesContainUpdateFor(framesA, selfText)).toBe(false)
    }
    finally {
      await ctxA.close()
      await ctxB.close()
    }
  })
})
