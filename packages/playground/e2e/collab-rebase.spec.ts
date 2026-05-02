import { expect, test } from '@playwright/test'
import { closePages, getCollabFields, openCollabEditor, openCollabEditors, openMultiplayerPeer, setTextFieldValue } from './collab-helpers'
import { uniqueText } from './utils'

test('keeps focused caret position when remote editor inserts text before it', async ({ browser }) => {
  const editors = await openCollabEditors(browser)

  try {
    const firstFields = getCollabFields(editors.first)
    const secondFields = getCollabFields(editors.second)
    const baseText = uniqueText('cursor-base')

    await firstFields.body.fill(baseText)
    await expect(secondFields.body).toHaveValue(baseText)

    const cursorIndex = 8
    await secondFields.body.evaluate((element, nextCursorIndex) => {
      const target = element as HTMLTextAreaElement
      target.focus()
      target.setSelectionRange(nextCursorIndex, nextCursorIndex, 'none')
      target.dispatchEvent(new Event('select', { bubbles: true }))
    }, cursorIndex)

    const prefix = `${uniqueText('prefix')}-`
    await firstFields.body.evaluate((element) => {
      const target = element as HTMLTextAreaElement
      target.focus()
      target.setSelectionRange(0, 0, 'none')
    })
    await firstFields.body.type(prefix)

    await expect(secondFields.body).toHaveValue(`${prefix}${baseText}`)
    await expect.poll(async () => secondFields.body.evaluate((element) => {
      const target = element as HTMLTextAreaElement
      return {
        start: target.selectionStart,
        end: target.selectionEnd,
      }
    })).toEqual({
      start: cursorIndex + prefix.length,
      end: cursorIndex + prefix.length,
    })
  }
  finally {
    await closePages(editors.first, editors.second)
  }
})

test('merges non-conflicting body edits and preserves undo redo history', async ({ browser }) => {
  const page = await openCollabEditor(browser, 'doc3')
  const peer = await openMultiplayerPeer(page, 'collab:doc3')

  try {
    const fields = getCollabFields(page)
    const syncedBase = `${uniqueText('merge-seed')} ${uniqueText('merge-base')}`
    const localSuffix = ` ${uniqueText('merge-local')}`
    const remotePrefix = `${uniqueText('merge-remote')} `

    await setTextFieldValue(fields.body, syncedBase)
    await fields.save.click()
    await expect(fields.save).toBeDisabled()
    await expect(fields.body).toBeEnabled()

    await setTextFieldValue(fields.body, `${syncedBase}${localSuffix}`)
    await expect(fields.body).toHaveValue(`${syncedBase}${localSuffix}`)

    peer.sendUpdate({ body: `${remotePrefix}${syncedBase}` })

    const mergedValue = `${remotePrefix}${syncedBase}${localSuffix}`
    const remoteOnlyValue = `${remotePrefix}${syncedBase}`

    await expect(fields.body).toHaveValue(mergedValue)

    await fields.undo.click()
    await expect(fields.body).toHaveValue(remoteOnlyValue)

    await fields.redo.click()
    await expect(fields.body).toHaveValue(mergedValue)
  }
  finally {
    await peer.close()
    await closePages(page)
  }
})
