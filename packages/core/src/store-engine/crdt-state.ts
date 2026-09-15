import type { FieldTimestamps } from '@rstore/shared'
import type { EngineContext } from './internal-types.js'
import { toKeyId } from './identity.js'

/** Get or create field timestamps for one collection. */
function ensureCollectionTimestamps(ctx: EngineContext, collectionName: string): Map<string, FieldTimestamps> {
  let timestamps = ctx.fieldTimestamps.get(collectionName)
  if (!timestamps) {
    timestamps = new Map()
    ctx.fieldTimestamps.set(collectionName, timestamps)
  }
  return timestamps
}

/** Read field timestamps through canonical numeric/string identity. */
export function getFieldTimestamps(ctx: EngineContext, collectionName: string, key: string | number): FieldTimestamps | undefined {
  return ctx.fieldTimestamps.get(collectionName)?.get(toKeyId(key))
}

/** Store field timestamps through canonical numeric/string identity. */
export function setFieldTimestamps(ctx: EngineContext, collectionName: string, key: string | number, timestamps: FieldTimestamps): void {
  const id = toKeyId(key)
  const state = ctx.collections.get(collectionName)
  if (state && !state.base.has(id) && !state.keyOverrides?.has(id)) {
    state.keyOverrides ??= new Map()
    state.keyOverrides.set(id, key)
  }
  ensureCollectionTimestamps(ctx, collectionName).set(id, timestamps)
}
