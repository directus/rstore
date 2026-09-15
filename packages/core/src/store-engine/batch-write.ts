import type { CollectionMetadata } from './collection-metadata.js'
import type { EngineCollectionState, EngineContext } from './internal-types.js'
import type { WriteItemParams, WriteItemsParams } from './types.js'
import { pickNonSpecialProps } from '@rstore/shared'
import { getCollectionMetadata } from './collection-metadata.js'
import { ownsDefaultKey, readDefaultKey, registerBaseKeyValue, toKeyId } from './identity.js'
import { validateWriteInput } from './relations.js'
import { commitWrite } from './write.js'

/** Reusable state for one safe relation-free unobserved batch. */
export interface PreparedBatchWrite {
  /** Cached immutable schema facts. */
  metadata: CollectionMetadata
  /** Collection storage resolved once for the whole batch. */
  state: EngineCollectionState
  /** Reused item parameters for the general fallback. */
  params: WriteItemParams
  /** Whether all per-row journals and index work can be skipped. */
  direct: boolean
}

/** Prepare batch-local commit state when no intermediate consumer is active. */
export function prepareBatchWrite(ctx: EngineContext, params: WriteItemsParams): PreparedBatchWrite | undefined {
  const metadata = getCollectionMetadata(params.collection)
  const state = ctx.ensureCollection(params.collection.name)
  if (metadata.hasRelations
    || ctx.staggering.enabled
    || state.layers.length > 0
    || ctx.fieldTimestamps.has(params.collection.name)
    || ctx.tombstones.size() > 0
    || params.meta?.$queryTracking
    || hasActiveStateSink(ctx)
    || ctx.observers.hasAny()) {
    return undefined
  }
  state.visibleKeys = undefined
  return {
    metadata,
    state,
    direct: !metadata.hasIndexes,
    params: {
      collection: params.collection,
      key: '',
      item: {},
      meta: params.meta,
      fromWriteItems: true,
    },
  }
}

/** Commit one item through prepared batch state. */
export function writePreparedBatchItem(
  ctx: EngineContext,
  prepared: PreparedBatchWrite,
  key: string | number,
  item: any,
): void {
  const params = prepared.params
  params.key = key
  params.item = item
  validateWriteInput(params)
  if (prepared.direct) {
    writeDirect(prepared, key, item)
    return
  }
  const mutable = !Object.isFrozen(item)
  const data = mutable ? pickNonSpecialProps(item, true) : item
  commitWrite(ctx, undefined, params, data, mutable, undefined, prepared.metadata, prepared.state)
}

/** Commit one observer-free, relation-free, non-indexed row. */
function writeDirect(prepared: PreparedBatchWrite, key: string | number, item: any): void {
  const { metadata, state, params } = prepared
  const mutable = !Object.isFrozen(item)
  const data = mutable ? pickNonSpecialProps(item, true) : item
  const id = toKeyId(key)
  const derived = metadata.usesDefaultKey
    ? readDefaultKey(item)
    : params.collection.getKey(item)
  registerBaseKeyValue(state, key, derived, ownsDefaultKey(item) || (!metadata.usesDefaultKey && derived !== undefined))
  const existing = state.base.get(id)
  state.base.set(id, mutable && existing !== undefined ? { ...existing, ...data } : data)
}

/** Return whether configured framework sink currently owns dependencies. */
function hasActiveStateSink(ctx: EngineContext): boolean {
  const sink = ctx.callbacks.stateChangeSink
  if (!sink)
    return false
  if (!sink.getInterest)
    return true
  const interest = sink.getInterest()
  return Boolean(interest && (interest.itemKeys.size || interest.lists.size || interest.indexes.size))
}
