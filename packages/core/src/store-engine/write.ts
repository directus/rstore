import type { FieldTimestamps } from '@rstore/shared'
import type { ChangeRecorder } from './change-recorder.js'
import type { CollectionMetadata } from './collection-metadata.js'
import type { EngineContext, EngineEffect, WriteCommitResult } from './internal-types.js'
import type { DeleteItemParams, EngineWriteChange, WriteItemParams } from './types.js'
import { pickNonSpecialProps } from '@rstore/shared'
import { mergeItemFields } from '../crdt/index.js'
import { shouldResurrect } from '../tombstone.js'
import { recordItem, recordList } from './change-recorder.js'
import { getCollectionMetadata } from './collection-metadata.js'
import { getPublicKey, refreshPublicKey, registerBaseKey, registerBaseKeyValue, releaseUnusedKey, toKeyId } from './identity.js'
import { reconcileItemIndexes } from './indexes.js'
import { planWriteTree, validateWriteInput } from './relations.js'
import { invalidateResolvedItem, invalidateVisibleKeys, resolveItemById } from './view.js'
import { appendWriteEffects, createWriteEffects } from './write-effects.js'

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
  if (state && !state.base.has(id) && !state.fallbackKeyValues?.has(id)) {
    state.fallbackKeyValues ??= new Map()
    state.fallbackKeyValues.set(id, key)
  }
  ensureCollectionTimestamps(ctx, collectionName).set(id, timestamps)
}

/** Commit a preflighted write tree and collect callbacks in legacy order. */
export function writeItemNow(ctx: EngineContext, changes: ChangeRecorder | undefined, params: WriteItemParams): WriteCommitResult {
  const effects: EngineEffect[] = []
  const metadata = getCollectionMetadata(params.collection)
  if (!metadata.hasRelations) {
    validateWriteInput(params)
    const mutable = !Object.isFrozen(params.item)
    const data = mutable ? pickNonSpecialProps(params.item, true) : params.item
    const change = commitWrite(ctx, changes, params, data, mutable, effects, metadata)
    return { effects, change }
  }
  let rootChange: EngineWriteChange | undefined
  for (const planned of planWriteTree(ctx, params)) {
    const change = commitWrite(
      ctx,
      changes,
      planned.params,
      planned.data,
      planned.mutable,
      effects,
      getCollectionMetadata(planned.params.collection),
    )
    if (planned.root) {
      rootChange = change
    }
  }
  return { effects, change: rootChange }
}

/** Commit one validated child or root write. */
function commitWrite(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
  params: WriteItemParams,
  data: any,
  mutable: boolean,
  effects: EngineEffect[],
  metadata: CollectionMetadata,
): EngineWriteChange | undefined {
  const { collection, key, item, marker, fromWriteItems, meta } = params
  const state = ctx.ensureCollection(collection.name)
  const id = toKeyId(key)
  const layerless = state.layers.length === 0
  const itemOwnsKey = metadata.usesDefaultKey && ownsKeyField(item)
  const existing = state.base.get(id)
  const previousPublicKey = state.publicKeys.get(id)
  const tombstone = ctx.tombstones.get(collection.name, key)
  if (tombstone) {
    if (params.fieldTimestamps && !shouldResurrect(tombstone, params.fieldTimestamps)) {
      return undefined
    }
    ctx.tombstones.clear(collection.name, key)
  }
  if (metadata.usesDefaultKey)
    registerBaseKeyValue(state, key, itemOwnsKey ? readDefaultKey(item) : undefined)
  else
    registerBaseKey(state, collection, key, item)
  const publicKey = getPublicKey(state, id)

  const previous = layerless ? existing : resolveItemById(state, id)
  const mergedBase = mutable
    ? mergeMutableItem(ctx, params, data, existing, publicKey, effects)
    : { value: data, valueChanged: true }
  if (mergedBase.valueChanged)
    state.base.set(id, mergedBase.value)
  if (mergedBase.valueChanged && !layerless)
    invalidateResolvedItem(state, id)
  const next = mergedBase.valueChanged
    ? (layerless ? mergedBase.value : resolveItemById(state, id))
    : previous
  if (metadata.hasIndexes && mergedBase.valueChanged && (existing === undefined || !mutable || touchesIndexedField(metadata, data)))
    reconcileItemIndexes(ctx, changes, collection, id, previous, next)
  const visibilityChanged = (previous !== undefined) !== (next !== undefined)
  const keyFormChanged = previousPublicKey !== undefined
    && previousPublicKey !== publicKey
    && (previous !== undefined || next !== undefined)
  if (mergedBase.valueChanged || keyFormChanged) {
    recordItem(
      changes,
      collection.name,
      id,
      next,
      keyFormChanged && previousPublicKey !== undefined
        ? { previousKey: previousPublicKey, key: publicKey }
        : undefined,
    )
  }
  if (visibilityChanged || keyFormChanged) {
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
  const change = !fromWriteItems || ctx.callbacks.onAfterWrite
    ? {
        key: publicKey,
        previousKey: previousPublicKey,
        visibilityChanged,
        keyFormChanged,
      }
    : undefined
  if (!fromWriteItems) {
    appendWriteEffects(
      ctx,
      effects,
      {
        collection,
        key: publicKey,
        previousKey: previousPublicKey,
        keyFormChanged,
        visibilityChanged,
        result: [item],
        marker,
        operation: 'write',
      },
      [change!],
    )
  }
  return change
}

/** Check whether one mutable patch can change any materialized membership. */
function touchesIndexedField(metadata: CollectionMetadata, data: any): boolean {
  const indexedFields = metadata.indexedFields
  for (const field in data) {
    if (Object.hasOwn(data, field) && indexedFields.has(field))
      return true
  }
  return false
}

/** Check whether default key derivation can change public key representation. */
function ownsKeyField(item: object): boolean {
  return Object.hasOwn(item, '$overrideKey') || Object.hasOwn(item, 'id') || Object.hasOwn(item, '__id')
}

/** Read default override/id/__id public-key policy. */
function readDefaultKey(item: any): unknown {
  return item?.$overrideKey ?? item?.id ?? item?.__id
}

/** Merge relation-free mutable data and defer any CRDT conflict hook. */
function mergeMutableItem(
  ctx: EngineContext,
  params: WriteItemParams,
  data: any,
  existing: any,
  publicKey: string | number,
  effects: EngineEffect[],
): BaseMergeResult {
  const { collection, fieldTimestamps } = params
  if (existing === undefined) {
    if (fieldTimestamps) {
      setFieldTimestamps(ctx, collection.name, publicKey, { ...fieldTimestamps })
    }
    return { value: data, valueChanged: true }
  }
  if (!fieldTimestamps) {
    return { value: { ...existing, ...data }, valueChanged: true }
  }

  const localTimestamps = getFieldTimestamps(ctx, collection.name, publicKey) ?? {}
  const { merged, mergedTimestamps, conflicts, valueChanged, timestampsChanged } = mergeItemFields(
    existing,
    data,
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

  const layerless = state.layers.length === 0
  const previous = layerless ? state.base.get(id) : resolveItemById(state, id)
  const publicKey = getPublicKey(state, id)
  state.base.delete(id)
  state.fallbackKeyValues?.delete(id)
  if (state.layers.length)
    refreshPublicKey(state, id)
  if (!layerless)
    invalidateResolvedItem(state, id)
  const next = layerless ? undefined : resolveItemById(state, id)
  if (getCollectionMetadata(collection).hasIndexes)
    reconcileItemIndexes(ctx, changes, collection, id, previous, next)
  const change: EngineWriteChange = {
    key: next === undefined ? publicKey : getPublicKey(state, id),
    previousKey: publicKey,
    visibilityChanged: (previous !== undefined) !== (next !== undefined),
    keyFormChanged: next !== undefined && publicKey !== getPublicKey(state, id),
  }
  recordItem(
    changes,
    collection.name,
    id,
    next,
    change.keyFormChanged ? { previousKey: publicKey, key: change.key } : undefined,
  )
  if (change.visibilityChanged || change.keyFormChanged) {
    invalidateVisibleKeys(state)
    recordList(changes, collection.name)
  }
  releaseUnusedKey(state, id)
  return {
    removed: true,
    change,
    effects: createWriteEffects(ctx, {
      collection,
      key: publicKey,
      previousKey: change.previousKey,
      keyFormChanged: change.keyFormChanged,
      visibilityChanged: change.visibilityChanged,
      operation: 'delete',
    }, [change]),
  }
}
