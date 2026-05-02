import { expect, test } from '@playwright/test'
import { openRealtimeApp, toggleTodo } from './realtime-helpers'
import { createTodo, todoByTitle, uniqueText } from './utils'

test('filtered live query updates when remote tab toggles todo completion', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()

  try {
    const { page: pageA } = await openRealtimeApp(ctxA)
    const { page: pageB } = await openRealtimeApp(ctxB)
    const text = uniqueText('realtime-filter')

    await createTodo(pageA, text)
    await pageB.getByRole('button', { name: 'Finished', exact: true }).click()
    await expect(todoByTitle(pageB, text)).toHaveCount(0)

    await toggleTodo(pageA, text)
    await expect(todoByTitle(pageB, text)).toBeVisible({ timeout: 5_000 })

    await toggleTodo(pageA, text)
    await expect(todoByTitle(pageB, text)).toHaveCount(0, { timeout: 5_000 })
  }
  finally {
    await ctxA.close()
    await ctxB.close()
  }
})
