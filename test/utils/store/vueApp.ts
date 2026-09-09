import type { App, EffectScope } from 'vue'
import { onTestFinished } from 'vitest'
import { createApp, effectScope } from 'vue'
import { RstorePlugin } from '../../../packages/vue/src'

/**
 * Vue lifecycle helpers that need no DOM.
 *
 * `useStore`, `defineModule` and `useQueryTracking` only take their real branch
 * inside an injection context or an effect scope. Both are reachable without
 * `jsdom`, `happy-dom` or `@vue/test-utils`, which is why this file exists
 * instead of a dependency. The `window` stub lives in `windowStub.ts`, which
 * imports no package source.
 */

/** Result of {@link withInjectionContext}. */
export interface InjectionContextResult<T> {
  /** What `fn` returned. */
  result: T
  /** The headless app providing the context, for a manual `unmount()`. */
  app: App
}

/**
 * Runs `fn` inside a real Vue injection context.
 *
 * `createApp({}).runWithContext()` makes `hasInjectionContext()` true and lets
 * `inject()` resolve, so `useStore()` reads the store the `RstorePlugin`
 * provided instead of falling back to `getActiveStore()`
 * (`packages/vue/src/plugin.ts:25`) and `defineModule()` takes its injection
 * branch (`packages/vue/src/module.ts:22`).
 *
 * @param store Store to install through `RstorePlugin`. Pass `null` to get an
 * injection context with no store installed, which is how the "not installed"
 * error path is reached.
 * @param fn Runs inside the context. Only its synchronous part is covered, as
 * with any Vue setup.
 */
export function withInjectionContext<T>(store: any | null, fn: () => T): InjectionContextResult<T> {
  const app = createApp({ render: () => null })
  if (store) {
    app.use(RstorePlugin, { store })
  }
  return {
    result: app.runWithContext(fn),
    app,
  }
}

/** Result of {@link withScope}. */
export interface ScopeResult<T> {
  /** What `fn` returned. */
  result: T
  /** The scope, if a test needs to nest more effects into it. */
  scope: EffectScope
  /** Stops the scope, firing every `tryOnScopeDispose` registered inside it. */
  stop: () => void
}

/**
 * Runs `fn` inside an `effectScope`, the way a component setup would.
 *
 * `tryOnScopeDispose` — what `tracking.ts` and `api/query.ts` use to release
 * tracked items, detach window listeners and unsubscribe — fires on
 * {@link ScopeResult.stop}, so this stands in for unmounting a component.
 *
 * @param fn Runs inside the scope. Only its synchronous part is covered by the
 * scope, so start queries here and await the returned promise outside.
 */
export function withScope<T>(fn: () => T): ScopeResult<T> {
  const scope = effectScope()
  const result = scope.run(fn)!
  return {
    result,
    scope,
    stop: () => scope.stop(),
  }
}

/** Run a standalone consumer in a real scope that always stops after its test. */
export function runInTestScope<T>(fn: () => T): T {
  const { result, stop } = withScope(fn)
  onTestFinished(stop)
  return result
}
