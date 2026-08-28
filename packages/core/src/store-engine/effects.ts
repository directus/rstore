import type { EngineContext, EngineEffect } from './internal-types.js'

/** Dispatch every effect and preserve one error or aggregate many errors. */
export function dispatchEffects(ctx: EngineContext, effects: readonly EngineEffect[]): void {
  if (!effects.length)
    return
  if (effects.length === 1) {
    dispatchEffect(ctx, effects[0]!)
    return
  }
  let errors: unknown[] | undefined
  for (const effect of effects) {
    try {
      dispatchEffect(ctx, effect)
    }
    catch (error) {
      errors ??= []
      errors.push(error)
    }
  }
  throwCollectedErrors(errors, 'Multiple store engine effects failed')
}

/** Dispatch one post-commit callback. */
function dispatchEffect(ctx: EngineContext, effect: EngineEffect): void {
  switch (effect.type) {
    case 'writeCommitted':
      ctx.callbacks.onWriteCommitted?.(effect.payload)
      break
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
export function throwCollectedErrors(errors: readonly unknown[] | undefined, message: string): void {
  if (!errors)
    return
  if (errors.length === 1) {
    throw errors[0]
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, message)
  }
}
