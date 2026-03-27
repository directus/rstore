type TutorialAction = () => unknown | Promise<unknown>

interface TutorialController {
  initialized: boolean
  state: Record<string, unknown>
  actions: Record<string, TutorialAction>
}

declare global {
  interface Window {
    __RSTORE_TUTORIAL__?: TutorialController
  }
}

function getController(): TutorialController {
  window.__RSTORE_TUTORIAL__ ??= {
    initialized: false,
    state: {},
    actions: {},
  }

  return window.__RSTORE_TUTORIAL__
}

function getPreviewSessionId() {
  return new URLSearchParams(window.location.search).get('session')
}

function createPreviewMessage(payload: Record<string, unknown>) {
  return {
    source: 'rstore-tutorial-preview',
    sessionId: getPreviewSessionId(),
    ...payload,
  }
}

function postToParent(payload: Record<string, unknown>) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(createPreviewMessage(payload), '*')
  }
}

export function resetTutorialState(nextState: Record<string, unknown> = {}) {
  const controller = getController()
  controller.state = {
    ...nextState,
  }
  postToParent({
    type: 'state-updated',
    state: getTutorialState(),
  })
}

export function setTutorialState(patch: Record<string, unknown>) {
  const controller = getController()
  Object.assign(controller.state, patch)
  postToParent({
    type: 'state-updated',
    state: getTutorialState(),
  })
}

export function getTutorialState(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(getController().state))
}

export function registerTutorialAction(name: string, action: TutorialAction) {
  const controller = getController()
  controller.actions[name] = action

  return () => {
    if (controller.actions[name] === action) {
      delete controller.actions[name]
    }
  }
}

export function initTutorialBridge() {
  const controller = getController()

  if (controller.initialized) {
    return
  }

  controller.initialized = true

  window.addEventListener('message', async (event) => {
    const message = event.data

    if (!message || message.source !== 'rstore-docs-tutorial' || message.sessionId !== getPreviewSessionId()) {
      return
    }

    const source = event.source as Window | null

    if (message.type === 'get-state') {
      source?.postMessage(createPreviewMessage({
        type: 'state-response',
        requestId: message.requestId,
        state: getTutorialState(),
      }), '*')
      return
    }

    if (message.type === 'run-action') {
      const action = controller.actions[message.action]

      if (!action) {
        source?.postMessage(createPreviewMessage({
          type: 'action-response',
          requestId: message.requestId,
          ok: false,
          error: `Action "${message.action}" is not registered.`,
          state: getTutorialState(),
        }), '*')
        return
      }

      try {
        const result = await action()
        source?.postMessage(createPreviewMessage({
          type: 'action-response',
          requestId: message.requestId,
          ok: true,
          result,
          state: getTutorialState(),
        }), '*')
      }
      catch (error) {
        source?.postMessage(createPreviewMessage({
          type: 'action-response',
          requestId: message.requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          state: getTutorialState(),
        }), '*')
      }
    }
  })

  postToParent({
    type: 'state-updated',
    state: getTutorialState(),
  })
}
