import { expect, test } from '@playwright/test'
import { createTodo, todoByTitle, uniqueText } from '../../../test/e2e/todoUi'
import { openRealtimeApp, waitForOnlineState } from './realtime-helpers'

test('reconnect catches up on todo created while another tab was offline', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()

  try {
    const { page: pageA } = await openRealtimeApp(ctxA)
    const { page: pageB } = await openRealtimeApp(ctxB)
    const text = uniqueText('realtime-reconnect')

    await ctxA.setOffline(true)
    await waitForOnlineState(pageA, false)

    await createTodo(pageB, text)
    await expect(todoByTitle(pageA, text)).toHaveCount(0)

    await ctxA.setOffline(false)
    await waitForOnlineState(pageA, true)

    await expect(todoByTitle(pageA, text)).toBeVisible({ timeout: 10_000 })
  }
  finally {
    await ctxA.close()
    await ctxB.close()
  }
})
