import { createEventHook } from '@vueuse/core'

const windowFocusEventHook = createEventHook()
let windowFocusTarget: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = null

function triggerWindowFocus() {
  windowFocusEventHook.trigger()
}

function ensureWindowFocusListener() {
  if (typeof window === 'undefined' || windowFocusTarget === window) {
    return
  }

  if (windowFocusTarget) {
    windowFocusTarget.removeEventListener('focus', triggerWindowFocus)
  }

  window.addEventListener('focus', triggerWindowFocus)
  windowFocusTarget = window
}

export function onWindowFocus(fn: () => void) {
  ensureWindowFocusListener()
  const { off } = windowFocusEventHook.on(fn)
  return off
}
