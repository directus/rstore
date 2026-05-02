import { expect, test } from '@playwright/test'
import { closePages, getCollabFields, openCollabEditor, openCollabEditors, openMultiplayerPeer, selectStatus, waitForEmptyPresence } from './collab-helpers'

test('shows peer presence and focused fields between collab editors', async ({ browser }) => {
  const editors = await openCollabEditors(browser)
  const statusPeer = await openMultiplayerPeer(editors.first, 'collab:doc1', 'status-peer')

  try {
    const secondFields = getCollabFields(editors.second)

    await secondFields.title.click()
    await expect(editors.first.getByText(/editing title/)).toBeVisible()

    statusPeer.sendPresence('status')
    await expect(editors.first.getByText(/editing status/)).toBeVisible()
    await statusPeer.close()

    await editors.second.close()
  }
  finally {
    await statusPeer.close()
    await closePages(editors.first, editors.second)
  }
})

test('removes peer presence immediately after multiplayer leave', async ({ browser }) => {
  const page = await openCollabEditor(browser)
  const peer = await openMultiplayerPeer(page, 'collab:doc1', 'leave-peer')

  try {
    peer.sendPresence('title')
    await expect(page.getByText(/editing title/)).toBeVisible()

    await peer.close()

    await waitForEmptyPresence(page)
  }
  finally {
    await peer.close()
    await closePages(page)
  }
})

test('syncs status changes between collab editors without reload', async ({ browser }) => {
  const editors = await openCollabEditors(browser, 'doc2')

  try {
    await expect(getCollabFields(editors.second).statusField).toContainText('Draft')

    await selectStatus(editors.first, 'Published')

    await expect(getCollabFields(editors.second).statusField).toContainText('Published')
  }
  finally {
    await closePages(editors.first, editors.second)
  }
})

test('settles to a single focus indicator after rapid title/body toggles', async ({ browser }) => {
  // Quickly switching focus between fields must not strand a stale
  // "editing X" indicator on the other peer — the most recent focus
  // wins and previous indicators must clear.
  const editors = await openCollabEditors(browser, 'doc3')

  try {
    const fields = getCollabFields(editors.second)

    // Rapid alternation between two fields. The remote peer should only
    // ever show the most recently focused field, never both at once.
    for (let i = 0; i < 5; i++) {
      await fields.title.click()
      await fields.body.click()
    }

    // Last focus was on body, so the first peer should ultimately show
    // exactly that — and not still display "editing title".
    await expect(editors.first.getByText(/editing body/i)).toBeVisible()
    await expect(editors.first.getByText(/editing title/i)).toHaveCount(0)
  }
  finally {
    await closePages(editors.first, editors.second)
  }
})

test('clears presence on the remote peer when the focus owner blurs', async ({ browser }) => {
  const editors = await openCollabEditors(browser, 'doc4')

  try {
    const secondFields = getCollabFields(editors.second)

    await secondFields.title.click()
    await expect(editors.first.getByText(/editing title/i)).toBeVisible()

    // Blur by focusing a non-collab element on the page.
    await editors.second.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

    await expect(editors.first.getByText(/editing title/i)).toHaveCount(0)
  }
  finally {
    await closePages(editors.first, editors.second)
  }
})
