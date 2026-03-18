import { registerTutorialSmokeActions } from './actions'
import { getTutorialState, initTutorialBridge, resetTutorialState, setTutorialState } from './bridge'

let stopPreviewStateSync: null | (() => void) = null

function getElementText(element: Element | null | undefined) {
  return element?.textContent?.trim() ?? ''
}

function getPrimaryListSelector() {
  return document.querySelector('.summary-list') ? '.summary-list li' : '.todo-list li'
}

function getTodoTexts(selector = getPrimaryListSelector()) {
  return Array.from(document.querySelectorAll(selector))
    .map((item) => {
      const strong = item.querySelector('strong')
      return getElementText(strong ?? item)
    })
    .filter(Boolean)
}

function getTodoCount(selector = getPrimaryListSelector()) {
  return document.querySelectorAll(selector).length
}

function getAssigneeNames() {
  return Array.from(document.querySelectorAll('.hint'))
    .map(getElementText)
    .filter(text => text.startsWith('Assignee:'))
    .map(text => text.slice('Assignee:'.length).trim())
    .filter(Boolean)
}

function syncPreviewState() {
  const state = getTutorialState()
  const selector = getPrimaryListSelector()
  const nextState: Record<string, unknown> = {
    listCount: getTodoCount(selector),
    todoTexts: getTodoTexts(selector),
    relations: {
      ...((state.relations as Record<string, unknown> | undefined) ?? {}),
      assigneeNames: getAssigneeNames(),
    },
  }

  if (document.querySelector('.summary-list')) {
    nextState.cache = {
      ...((state.cache as Record<string, unknown> | undefined) ?? {}),
      count: getTodoCount('.summary-list li'),
    }
  }

  setTutorialState(nextState)
}

function startPreviewStateSync() {
  if (typeof window === 'undefined' || !document.body) {
    return () => {}
  }

  let frame = 0
  const scheduleSync = () => {
    if (frame) {
      return
    }

    frame = window.requestAnimationFrame(() => {
      frame = 0
      syncPreviewState()
    })
  }

  const observer = new MutationObserver(scheduleSync)
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  })

  scheduleSync()

  return () => {
    if (frame) {
      window.cancelAnimationFrame(frame)
    }

    observer.disconnect()
  }
}

export function createDemoRuntime() {
  return {
    start() {
      stopPreviewStateSync?.()
      stopPreviewStateSync = null
      initTutorialBridge()
      resetTutorialState({
        booted: false,
        storeReady: false,
      })
      registerTutorialSmokeActions()
    },

    markReady(verifyStore: () => unknown) {
      try {
        verifyStore()
        stopPreviewStateSync = startPreviewStateSync()
        setTutorialState({
          booted: true,
          storeReady: true,
        })
      }
      catch (error) {
        setTutorialState({
          booted: false,
          storeReady: false,
          lastError: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}
