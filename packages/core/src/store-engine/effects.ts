import type { EngineContext, EngineEffect } from './internal-types.js'

/** Dispatch every effect and preserve one error or aggregate many errors. */
export function dispatchEffects(ctx: EngineContext, effects: readonly EngineEffect[]): void {
  const errors: unknown[] = []
  for (const effect of effects) {
    try {
      dispatchEffect(ctx, effect)
    }
    catch (error) {
      errors.push(error)
    }
  }
  throwCollectedErrors(errors, 'Multiple store engine effects failed')
}

/** Dispatch one post-commit callback. */
function dispatchEffect(ctx: EngineContext, effect: EngineEffect): void {
  switch (effect.type) {
    case 'afterWrite':
      ctx.callbacks.onAfterWrite?.(effect.payload)
      break
    case 'conflict':
      ctx.callbacks.onConflict?.(effect.payload)
      break
    case 'layerAdd':
      ctx.callbacks.onLayerAdd?.(effect.layer)
      break
    case 'layerRemove':
      ctx.callbacks.onLayerRemove?.(effect.layer)
      break
    case 'reset':
      ctx.callbacks.onReset?.(effect.payload)
      break
  }
}

/** Throw no error, one original error, or an aggregate for multiple errors. */
export function throwCollectedErrors(errors: readonly unknown[], message: string): void {
  if (errors.length === 1) {
    throw errors[0]
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, message)
  }
}
