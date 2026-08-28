import type { EngineContext, EngineEffect } from './internal-types.js'
import type { EngineWriteChange, EngineWriteCommitPayload } from './types.js'

/** Build only write callback effects configured by embedding adapter. */
export function createWriteEffects(
  ctx: EngineContext,
  payload: EngineWriteCommitPayload,
  changes: readonly EngineWriteChange[] | undefined,
): EngineEffect[] {
  const effects: EngineEffect[] = []
  appendWriteEffects(ctx, effects, payload, changes)
  return effects
}

/** Append compact and compatibility callbacks without temporary array. */
export function appendWriteEffects(
  ctx: EngineContext,
  effects: EngineEffect[],
  payload: EngineWriteCommitPayload,
  changes: readonly EngineWriteChange[] | undefined,
): void {
  if (ctx.callbacks.onWriteCommitted)
    effects.push({ type: 'writeCommitted', payload })
  if (ctx.callbacks.onAfterWrite)
    effects.push({ type: 'afterWrite', payload: { ...payload, changes: changes ?? [] } })
}
