import type { FieldTimestamps } from '@rstore/shared'
import type { ChangeRecorder } from './change-recorder.js'
import type { EngineContext, EngineEffect, WriteCommitResult } from './internal-types.js'
import type { PlannedWrite } from './relations.js'
import type { DeleteItemParams, EngineWriteChange, WriteItemParams } from './types.js'
import { mergeItemFields } from '../crdt/index.js'
import { shouldResurrect } from '../tombstone.js'
import { recordItem, recordList } from './change-recorder.js'
import { getCollectionMetadata } from './collection-metadata.js'
import { getPublicKey, refreshPublicKey, registerBaseKey, releaseUnusedKey, toKeyId } from './identity.js'
import { reconcileItemIndexes } from './indexes.js'
import { planRelationFreeWrite, planWriteTree } from './relations.js'
import { invalidateResolvedItem, invalidateVisibleKeys, resolveItemById } from './view.js'

/** Result of deleting one base item. */
export interface DeleteCommitResult {
  /** Whether base state contained the key. */
  removed: boolean
  /** Deferred delete hook. */
  effects: EngineEffect[]
  /** Visibility/key-form metadata when removed. */
  change?: EngineWriteChange
}

/** Mutable merge result with observable-value identity information. */
interface BaseMergeResult {
  /** Base value to store or retain. */
  value: any
  /** Whether resolved item data can have changed. */
  valueChanged: boolean
}

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
  if (state && !state.keyValues.has(id)) {
    state.keyValues.set(id, key)
  }
  ensureCollectionTimestamps(ctx, collectionName).set(id, timestamps)
}

/** Commit a preflighted write tree and collect callbacks in legacy order. */
export function writeItemNow(ctx: EngineContext, changes: ChangeRecorder | undefined, params: WriteItemParams): WriteCommitResult {
  const effects: EngineEffect[] = []
  if (!getCollectionMetadata(params.collection).hasRelations) {
    const change = commitPlannedWrite(ctx, changes, planRelationFreeWrite(params), effects)
    return { effects, change }
  }
  let rootChange: EngineWriteChange | undefined
  for (const planned of planWriteTree(ctx, params)) {
    const change = commitPlannedWrite(ctx, changes, planned, effects)
    if (planned.root) {
      rootChange = change
    }
  }
  return { effects, change: rootChange }
}

/** Commit one validated child or root write. */
function commitPlannedWrite(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
  planned: PlannedWrite,
  effects: EngineEffect[],
): EngineWriteChange | undefined {
  const { collection, key, item, marker, fromWriteItems, meta } = planned.params
  const state = ctx.ensureCollection(collection.name)
  const id = toKeyId(key)
  const previousPublicKey = state.keyValues.get(id)
  const tombstone = ctx.tombstones.get(collection.name, key)
  if (tombstone) {
    if (planned.params.fieldTimestamps && !shouldResurrect(tombstone, planned.params.fieldTimestamps)) {
      return undefined
    }
    ctx.tombstones.clear(collection.name, key)
  }
  registerBaseKey(state, collection, key, item)
  const publicKey = getPublicKey(state, id)

  const previous = resolveItemById(state, id)
  const existing = state.base.get(id)
  const mergedBase = planned.mutable
    ? mergeMutableItem(ctx, planned, existing, publicKey, effects)
    : { value: planned.data, valueChanged: true }
  if (mergedBase.valueChanged)
    state.base.set(id, mergedBase.value)

  if (mergedBase.valueChanged)
    invalidateResolvedItem(state, id)
  const next = mergedBase.valueChanged ? resolveItemById(state, id) : previous
  if (mergedBase.valueChanged && (existing === undefined || !planned.mutable || touchesIndexedField(collection, planned.data)))
    reconcileItemIndexes(ctx, changes, collection, id, next)
  const change: EngineWriteChange = {
    key: publicKey,
    previousKey: previousPublicKey,
    visibilityChanged: (previous !== undefined) !== (next !== undefined),
    keyFormChanged: previousPublicKey !== undefined
      && previousPublicKey !== publicKey
      && (previous !== undefined || next !== undefined),
  }
  if (mergedBase.valueChanged || change.keyFormChanged)
    recordItem(changes, collection.name, id)
  if (change.visibilityChanged || change.keyFormChanged) {
    invalidateVisibleKeys(state)
    recordList(changes, collection.name)
  }

  if (marker !== undefined) {
    ctx.markers[marker] = true
    recordList(changes, collection.name)
  }
  if (meta?.$queryTracking) {
    meta.$queryTracking.items[collection.name] ??= new Set()
    meta.$queryTracking.items[collection.name]!.add(publicKey)
  }
  if (!fromWriteItems) {
    effects.push({
      type: 'afterWrite',
      payload: { collection, key: publicKey, result: [item], marker, operation: 'write', changes: [change] },
    })
  }
  return change
}

/** Check whether one mutable patch can change any materialized membership. */
function touchesIndexedField(collection: PlannedWrite['params']['collection'], data: any): boolean {
  const indexedFields = getCollectionMetadata(collection).indexedFields
  for (const field in data) {
    if (Object.hasOwn(data, field) && indexedFields.has(field))
      return true
  }
  return false
}

/** Merge relation-free mutable data and defer any CRDT conflict hook. */
function mergeMutableItem(
  ctx: EngineContext,
  planned: PlannedWrite,
  existing: any,
  publicKey: string | number,
  effects: EngineEffect[],
): BaseMergeResult {
  const { collection, fieldTimestamps } = planned.params
  if (existing === undefined) {
    if (fieldTimestamps) {
      setFieldTimestamps(ctx, collection.name, publicKey, { ...fieldTimestamps })
    }
    return { value: planned.data, valueChanged: true }
  }
  if (!fieldTimestamps) {
    return { value: { ...existing, ...planned.data }, valueChanged: true }
  }

  const localTimestamps = getFieldTimestamps(ctx, collection.name, publicKey) ?? {}
  const { merged, mergedTimestamps, conflicts, valueChanged, timestampsChanged } = mergeItemFields(
    existing,
    planned.data,
    localTimestamps,
    fieldTimestamps,
  )
  if (timestampsChanged)
    setFieldTimestamps(ctx, collection.name, publicKey, mergedTimestamps)
  if (conflicts.length > 0) {
    effects.push({ type: 'conflict', payload: { collection, key: publicKey, conflicts } })
  }
  return { value: merged, valueChanged }
}

/** Delete one base item and collect its post-commit hook. */
export function deleteItemFromBase(ctx: EngineContext, changes: ChangeRecorder | undefined, params: DeleteItemParams): DeleteCommitResult {
  const { collection, key } = params
  const state = ctx.collections.get(collection.name)
  if (!state) {
    return { removed: false, effects: [] }
  }
  const id = toKeyId(key)
  if (!state.base.has(id)) {
    return { removed: false, effects: [] }
  }

  const previous = resolveItemById(state, id)
  const publicKey = getPublicKey(state, id)
  state.base.delete(id)
  state.baseKeyValues.delete(id)
  refreshPublicKey(state, id)
  invalidateResolvedItem(state, id)
  const next = resolveItemById(state, id)
  reconcileItemIndexes(ctx, changes, collection, id, next)
  recordItem(changes, collection.name, id)
  const change: EngineWriteChange = {
    key: next === undefined ? publicKey : getPublicKey(state, id),
    previousKey: publicKey,
    visibilityChanged: (previous !== undefined) !== (next !== undefined),
    keyFormChanged: next !== undefined && publicKey !== getPublicKey(state, id),
  }
  if (change.visibilityChanged || change.keyFormChanged) {
    invalidateVisibleKeys(state)
    recordList(changes, collection.name)
  }
  releaseUnusedKey(state, id)
  return {
    removed: true,
    change,
    effects: [{
      type: 'afterWrite',
      payload: { collection, key: publicKey, operation: 'delete', changes: [change] },
    }],
  }
}
