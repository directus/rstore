import type { Browser, Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

const EMPTY_LABEL = 'No other editors — open this page in another tab!'

export interface CollabEditors {
  first: Page
  second: Page
}

export interface MultiplayerTestPeer {
  user: {
    id: string
    name: string
    color: string
  }
  close: () => Promise<void>
  sendPresence: (field?: string) => void
  sendUpdate: (data: Record<string, unknown>) => void
}

export interface CollabFields {
  title: Locator
  body: Locator
  statusField: Locator
  undo: Locator
  redo: Locator
  save: Locator
  conflictBanner: Locator
}

/**
 * Open single collaborative editor page.
 */
export async function openCollabEditor(
  browser: Browser,
  documentId = 'doc1',
): Promise<Page> {
  const page = await browser.newPage()
  await page.goto(`/collab/${documentId}`)
  await expect(page).toHaveURL(new RegExp(`/collab/${documentId}$`))
  return page
}

/**
 * Open same collaborative document in 2 browser tabs.
 */
export async function openCollabEditors(
  browser: Browser,
  documentId = 'doc1',
): Promise<CollabEditors> {
  const first = await openCollabEditor(browser, documentId)
  const second = await openCollabEditor(browser, documentId)

  await waitForPeerPresence(first)
  await waitForPeerPresence(second)

  return {
    first,
    second,
  }
}

/**
 * Return stable field locators for collab editor page.
 */
export function getCollabFields(page: Page): CollabFields {
  return {
    title: page.getByPlaceholder('Document title'),
    body: page.getByPlaceholder('Write your content here...'),
    statusField: page.getByTestId('collab-status-field'),
    undo: page.getByRole('button', { name: 'Undo', exact: true }),
    redo: page.getByRole('button', { name: 'Redo', exact: true }),
    save: page.getByRole('button', { name: 'Save', exact: true }),
    conflictBanner: page.getByTestId('collab-conflict-banner'),
  }
}

/**
 * Focus status select trigger without changing current value.
 */
export async function focusStatusField(page: Page) {
  const trigger = page.getByTestId('collab-status-field').locator('button').first()
  await expect(trigger).toBeVisible()
  await trigger.click()
}

/**
 * Pick status value from collab select.
 */
export async function selectStatus(page: Page, label: 'Draft' | 'Published') {
  await focusStatusField(page)
  const option = page.getByRole('option', { name: label, exact: true })
  await expect(option).toBeVisible()
  await option.click()
  await expect(page.getByTestId('collab-status-field')).toContainText(label)
}

/**
 * Replace input or textarea value in one `input` event.
 */
export async function setTextFieldValue(field: Locator, value: string) {
  await field.evaluate((element, nextValue) => {
    const target = element as HTMLInputElement | HTMLTextAreaElement
    target.focus()
    target.value = nextValue
    target.setSelectionRange?.(nextValue.length, nextValue.length, 'none')
    target.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    target.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

/**
 * Assert peer connected and empty label gone.
 */
export async function waitForPeerPresence(page: Page) {
  await expect(page.getByText(EMPTY_LABEL, { exact: true })).toHaveCount(0)
}

/**
 * Assert no peer remains in room.
 */
export async function waitForEmptyPresence(page: Page) {
  await expect(page.getByText(EMPTY_LABEL, { exact: true })).toBeVisible()
}

/**
 * Open raw websocket peer for deterministic multiplayer frames in tests.
 */
export async function openMultiplayerPeer(
  page: Page,
  roomId: string,
  userId = `peer-${Math.random().toString(16).slice(2, 10)}`,
): Promise<MultiplayerTestPeer> {
  const wsUrl = await page.evaluate(() => {
    const url = new URL('/_ws', window.location.href)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    return url.toString()
  })
  const socket = new WebSocket(wsUrl)

  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', event => reject(event), { once: true })
  })

  const user = {
    id: userId,
    name: `Peer ${userId.slice(-4)}`,
    color: '#ef4444',
  }

  return {
    user,
    sendPresence(field) {
      socket.send(JSON.stringify({
        type: 'multiplayer:presence',
        roomId,
        user,
        field,
      }))
    },
    sendUpdate(data) {
      socket.send(JSON.stringify({
        type: 'multiplayer:update',
        roomId,
        userId: user.id,
        data,
      }))
    },
    async close() {
      if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        return
      }

      await new Promise<void>((resolve) => {
        socket.addEventListener('close', () => resolve(), { once: true })
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: 'multiplayer:leave',
            roomId,
            userId: user.id,
          }))
        }
        socket.close()
      })
    },
  }
}

/**
 * Close pages if still open.
 */
export async function closePages(...pages: Page[]) {
  await Promise.all(
    pages
      .filter(page => !page.isClosed())
      .map(page => page.close()),
  )
}
