import type { ChangeRecorder, FlushChangeRecorder } from './change-recorder.js'
import type { EngineContext, EngineEffect } from './internal-types.js'
import { commitStateChangeSink, getFlushChanges } from './change-recorder.js'
import { appendError, dispatchEffects, throwCollectedErrors } from './effects.js'

export { appendError } from './effects.js'

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
  try {
    dispatchEffects(ctx, effects)
  }
  catch (error) {
    for (const nested of error instanceof AggregateError ? error.errors : [error])
      errors = appendError(errors, nested)
  }
  throwCollectedErrors(errors, 'Store engine operation callbacks failed')
}

/** Run direct observers even when framework publication fails. */
export function dispatchFinalObservers(
  ctx: EngineContext,
  flush: FlushChangeRecorder,
  errors: unknown[] | undefined,
): unknown[] | undefined {
  const changes = getFlushChanges(flush)
  if (!changes)
    return errors
  ctx.observers.dispatch(changes)
  return errors
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
