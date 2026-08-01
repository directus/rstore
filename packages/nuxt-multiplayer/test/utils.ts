import { vi } from 'vitest'
import { effectScope } from 'vue'

/**
 * Run a composable inside an effect scope so its `onUnmounted` registers
 * without firing the "called outside setup()" warning. Returns the value
 * the composable produced and a `dispose()` to release the scope.
 */
export function withScope<T>(fn: () => T): { value: T, dispose: () => void } {
  const scope = effectScope()
  const value = scope.run(fn) as T
  return { value, dispose: () => scope.stop() }
}

/**
 * Silence Vue's "onUnmounted called outside setup" warning that fires when
 * a composable using lifecycle hooks runs outside a component — the
 * effect-scope wrapper isn't a substitute for an instance (Vue only checks
 * for a current instance, not a current scope). Other warnings pass through.
 *
 * Call inside `beforeEach`; pair with `vi.restoreAllMocks()` in `afterEach`.
 */
export function muteVueLifecycleWarnings(): void {
  const realWarn = console.warn
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    if (!String(args[0] ?? '').includes('onUnmounted')) {
      realWarn(...args)
    }
  })
}
