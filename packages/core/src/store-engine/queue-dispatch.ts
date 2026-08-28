import type { ChangeRecorder, FlushChangeRecorder } from './change-recorder.js'
import type { EngineContext, EngineEffect } from './internal-types.js'
import { commitStateChangeSink, getFlushChanges, getOperationChanges } from './change-recorder.js'
import { dispatchEffects, throwCollectedErrors } from './effects.js'

/** Publish framework state before hooks, collecting every callback failure. */
export function dispatchCommitted(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
  effects: readonly EngineEffect[],
): void {
  let errors: unknown[] | undefined
  try {
    commitStateChangeSink(changes)
  }
  catch (error) {
    errors = appendError(errors, error)
  }
  const operationChanges = getOperationChanges(changes)
  if (operationChanges) {
    try {
      ctx.callbacks.onStateChange?.(operationChanges)
    }
    catch (error) {
      errors = appendError(errors, error)
    }
  }
  try {
    dispatchEffects(ctx, effects)
  }
  catch (error) {
    for (const nested of error instanceof AggregateError ? error.errors : [error])
      errors = appendError(errors, nested)
  }
  throwCollectedErrors(errors, 'Store engine operation callbacks failed')
}

/** Run bridge flush then direct observers, even when bridge flush fails. */
export function dispatchFinalObservers(
  ctx: EngineContext,
  flush: FlushChangeRecorder,
  errors: unknown[] | undefined,
): unknown[] | undefined {
  const changes = getFlushChanges(flush)
  if (!changes)
    return errors
  try {
    ctx.callbacks.onObserverFlush?.(changes)
  }
  catch (error) {
    errors = appendError(errors, error)
  }
  ctx.observers.dispatch(changes)
  return errors
}

/** Lazily allocate callback error storage. */
export function appendError(errors: unknown[] | undefined, error: unknown): unknown[] {
  const result = errors ?? []
  result.push(error)
  return result
}

/** Dispatch immediate GC callbacks while preserving final observers on errors. */
export function dispatchImmediate(
  ctx: EngineContext,
  recorder: ChangeRecorder | undefined,
  flush: FlushChangeRecorder,
  effects: readonly EngineEffect[],
): void {
  let errors: unknown[] | undefined
  try {
    dispatchCommitted(ctx, recorder, effects)
  }
  catch (error) {
    errors = appendError(errors, error)
  }
  errors = dispatchFinalObservers(ctx, flush, errors)
  throwCollectedErrors(errors, 'Store engine callbacks failed')
}
