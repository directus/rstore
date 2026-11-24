import type { EngineContext, EngineEffect } from './internal-types.js'
import type { EngineWriteCommitPayload } from './types.js'

/** Build only write callback effects configured by embedding adapter. */
export function createWriteEffects(
  ctx: EngineContext,
  payload: EngineWriteCommitPayload,
): EngineEffect[] {
  const effects: EngineEffect[] = []
  appendWriteEffects(ctx, effects, payload)
  return effects
}

/** Append compact write callbacks without temporary array. */
export function appendWriteEffects(
  ctx: EngineContext,
  effects: EngineEffect[],
  payload: EngineWriteCommitPayload,
): void {
  if (ctx.callbacks.onWriteCommitted)
    effects.push({ type: 'writeCommitted', payload })
}
