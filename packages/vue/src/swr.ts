import { createEventHook } from '@vueuse/core'

/** Fan-out of the single native `focus` listener to every refreshing query. */
const windowFocusEventHook = createEventHook()
/** Window the native listener is attached to, if any. */
let windowFocusTarget: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = null

/** Native `focus` handler notifying every registered query. */
function triggerWindowFocus() {
  windowFocusEventHook.trigger()
}

/** Attach the native listener once to the current window. */
function ensureWindowFocusListener() {
  if (windowFocusTarget === window) {
    return
  }

  if (windowFocusTarget) {
    windowFocusTarget.removeEventListener('focus', triggerWindowFocus)
  }

  window.addEventListener('focus', triggerWindowFocus)
  windowFocusTarget = window
}

/**
 * Call `fn` whenever the browser window regains focus.
 *
 * Without a window (server rendering, plain Node) focus can never happen, so
 * nothing is registered: a module-level listener would otherwise keep `fn` and
 * everything it closes over alive for the whole process.
 *
 * @returns A function removing the listener.
 */
export function onWindowFocus(fn: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }
  ensureWindowFocusListener()
  const { off } = windowFocusEventHook.on(fn)
  return off
}
