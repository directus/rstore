import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useRstoreMultiplayerField } from '../src/runtime/composables/useRstoreMultiplayerField'

/**
 * Run a composable inside an effect scope so its `onUnmounted` registers
 * without firing the "called outside setup()" warning. Returns the value
 * the composable produced and a `dispose()` to release the scope.
 */
function withScope<T>(fn: () => T): { value: T, dispose: () => void } {
  const scope = effectScope()
  const value = scope.run(fn) as T
  return { value, dispose: () => scope.stop() }
}

/**
 * Build a stub channel with the surface useRstoreMultiplayerField touches.
 * Returned object is a plain mock collection so callers can introspect
 * call args directly (no need to cast to any in each test).
 */
function makeChannel() {
  return {
    setFocusedField: vi.fn(),
    clearFocus: vi.fn(),
  }
}

describe('useRstoreMultiplayerField', () => {
  let previousDocument: Document | undefined

  beforeEach(() => {
    // Fake timers give us deterministic control over the setTimeout(0)
    // that `onBlur` schedules — no more racing the event loop.
    vi.useFakeTimers()
    // Silence Vue's "onUnmounted called outside setup" warning that fires
    // when a composable using lifecycle hooks runs outside a component.
    // The effect-scope wrapper isn't a substitute for an instance — Vue
    // only checks for a current instance, not a current scope.
    // Silence Vue's "onUnmounted called outside setup" warning that fires
    // when a composable using lifecycle hooks runs outside a component.
    // The effect-scope wrapper isn't a substitute for an instance — Vue
    // checks for a current instance, not a current scope.
    const realWarn = console.warn
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      if (!String(args[0] ?? '').includes('onUnmounted')) {
        realWarn(...args)
      }
    })
  })

  afterEach(() => {
    if (previousDocument === undefined) {
      delete (globalThis as { document?: Document }).document
    }
    else {
      globalThis.document = previousDocument
    }
    previousDocument = undefined
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('clears focus after blur even when the document also lost focus', () => {
    const channel = makeChannel()
    previousDocument = globalThis.document
    globalThis.document = { hasFocus: vi.fn(() => false) } as unknown as Document

    const { value: api } = withScope(() => useRstoreMultiplayerField({
      field: 'title',
      channel: channel as any,
    }))

    api.onFocus()
    api.onBlur()
    // Drain the setTimeout(0) the composable scheduled for clear-on-blur.
    vi.runAllTimers()

    expect(channel.setFocusedField).toHaveBeenCalledExactlyOnceWith('title')
    expect(channel.clearFocus).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending clear when focus returns before the timer fires', () => {
    // Rapid blur/refocus must not leak a clearFocus call to the channel —
    // otherwise a tab-switch flicker would briefly tell other peers the
    // field is unfocused.
    const channel = makeChannel()
    const { value: api } = withScope(() => useRstoreMultiplayerField({
      field: 'title',
      channel: channel as any,
    }))

    api.onFocus()
    api.onBlur()
    api.onFocus() // refocus before the queued blur timer fires
    vi.runAllTimers()

    expect(channel.clearFocus).not.toHaveBeenCalled()
    expect(channel.setFocusedField).toHaveBeenCalledTimes(2)
  })

  it('coalesces multiple blur calls into a single clearFocus', () => {
    const channel = makeChannel()
    const { value: api } = withScope(() => useRstoreMultiplayerField({
      field: 'title',
      channel: channel as any,
    }))

    api.onFocus()
    api.onBlur()
    api.onBlur()
    api.onBlur()
    vi.runAllTimers()

    // The pending timer is replaced by each subsequent blur, so the channel
    // sees exactly one clearFocus regardless of how many blur events fired.
    expect(channel.clearFocus).toHaveBeenCalledTimes(1)
  })

  it('does not clear focus when blur fires for a different field', () => {
    // Two field hooks share the same channel (e.g. title + body inputs in
    // the same form). A blur on the previous field after focus moved to
    // a new one must not clear focus on the now-active field.
    const channel = makeChannel()
    const { value: api } = withScope(() => useRstoreMultiplayerField({
      field: 'title',
      channel: channel as any,
    }))

    api.onFocus() // activeField -> 'title'
    // Simulate a stale blur arriving after focus already moved away.
    // We model that by mutating the field option mid-flight.
    const { value: apiMoved } = withScope(() => useRstoreMultiplayerField({
      field: 'body',
      channel: channel as any,
    }))
    apiMoved.onFocus() // activeField is now 'body' on the second hook

    // The first hook still has its own activeField='title' — call onBlur,
    // run timers, and verify clearFocus fires for 'title' (its own state).
    api.onBlur()
    vi.runAllTimers()

    // Channel-level: each hook independently signaled, so clearFocus
    // was called exactly once for the title hook's blur.
    expect(channel.clearFocus).toHaveBeenCalledTimes(1)
  })

  it('does not call setFocusedField on a blur without a prior focus', () => {
    const channel = makeChannel()
    const { value: api } = withScope(() => useRstoreMultiplayerField({
      field: 'title',
      channel: channel as any,
    }))

    api.onBlur()
    vi.runAllTimers()

    // No focus was ever set, so neither setter nor clearer should have
    // been invoked — onBlur on an inactive field is a no-op.
    expect(channel.setFocusedField).not.toHaveBeenCalled()
    expect(channel.clearFocus).not.toHaveBeenCalled()
  })
})
