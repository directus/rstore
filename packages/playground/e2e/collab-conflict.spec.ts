import { expect, test } from '@playwright/test'
import { closePages, getCollabFields, openCollabEditor, openMultiplayerPeer, setTextFieldValue } from './collab-helpers'
import { uniqueText } from './utils'

test('shows conflict banner and accepts remote title in collab editor', async ({ browser }) => {
  const page = await openCollabEditor(browser, 'doc3')
  const peer = await openMultiplayerPeer(page, 'collab:doc3')

  try {
    const fields = getCollabFields(page)
    const syncedTitle = uniqueText('conflict-synced')
    const localTitle = uniqueText('conflict-local')
    const remoteTitle = uniqueText('conflict-remote')

    await setTextFieldValue(fields.title, syncedTitle)
    await fields.save.click()
    await expect(fields.save).toBeDisabled()

    await setTextFieldValue(fields.title, localTitle)
    await expect(fields.title).toHaveValue(localTitle)

    peer.sendUpdate({ title: remoteTitle })

    await expect(fields.conflictBanner).toBeVisible()
    await expect(fields.conflictBanner).toContainText('title')
    await expect(fields.conflictBanner).toContainText(localTitle)
    await expect(fields.conflictBanner).toContainText(remoteTitle)

    await page.getByTestId('collab-conflict-accept-remote-title').click()

    await expect(fields.conflictBanner).toBeHidden()
    await expect(fields.title).toHaveValue(remoteTitle)
  }
  finally {
    await peer.close()
    await closePages(page)
  }
})
