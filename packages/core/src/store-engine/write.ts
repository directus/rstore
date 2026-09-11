import type { ChangeRecorder } from './change-recorder.js'
import type { CollectionMetadata } from './collection-metadata.js'
import type { EngineCollectionState, EngineContext, EngineEffect, WriteCommitResult } from './internal-types.js'
import type { DeleteItemParams, WriteItemParams } from './types.js'
import { pickNonSpecialProps } from '@rstore/shared'
import { mergeItemFields } from '../crdt/index.js'
import { shouldResurrect } from '../tombstone.js'
import { fieldValuesEqual } from '../utils/equality.js'
import { recordItem, recordList } from './change-recorder.js'
import { getCollectionMetadata } from './collection-metadata.js'
import { getFieldTimestamps, setFieldTimestamps } from './crdt-state.js'
import { clearKeyOverride, getPublicKey, matchesKeyId, ownsDefaultKey, readDefaultKey, registerBaseKeyValue, releaseUnusedKey, toKeyId } from './identity.js'
import { reconcileItemIndexes } from './indexes.js'
import { planWriteTree, resolveRelationWriteParams, validateRelationCardinality, validateWriteInput } from './relations.js'
import { invalidateResolvedItem, invalidateVisibleKeys, resolveItemById } from './view.js'
import { appendWriteEffects, createWriteEffects } from './write-effects.js'

/** Result of deleting one base item. */
export interface DeleteCommitResult {
  /** Whether base state contained the key. */
  removed: boolean
  /** Deferred delete hook. */
  effects: EngineEffect[]
}

/** Mutable merge result with observable-value identity information. */
interface BaseMergeResult {
  /** Base value to store or retain. */
  value: any
  /** Whether resolved item data can have changed. */
  valueChanged: boolean
}

/** Child-first progress retained when a later relation fails validation. */
export interface PartialWriteProgress {
  /** Whether at least one nested item reached base state. */
  committed: boolean
  /** Deferred hooks belonging to committed nested items. */
  effects: EngineEffect[]
}

/** Commit a preflighted write tree and collect post-commit callbacks. */
export function writeItemNow(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
  params: WriteItemParams,
  partial?: PartialWriteProgress,
): WriteCommitResult {
  const effects: EngineEffect[] = []
  const metadata = getCollectionMetadata(params.collection)
  if (!metadata.hasRelations) {
    validateWriteInput(params)
    const mutable = !Object.isFrozen(params.item)
    const data = mutable ? pickNonSpecialProps(params.item, true) : params.item
    commitWrite(ctx, changes, params, data, mutable, effects, metadata)
    return { effects }
  }
  // Vue publishes each staggered slice. Preserve child-first progress when a
  // later nested payload is malformed, while Core keeps full preflight rules.
  if (ctx.callbacks.stateChangeSink) {
    const progress = { committed: false }
    try {
      writeRelationTreeInOrder(ctx, changes, params, effects, new WeakSet(), progress)
      return { effects }
    }
    catch (error) {
      if (progress.committed && partial) {
        partial.committed = true
        partial.effects.push(...effects)
      }
      throw error
    }
  }
  for (const planned of planWriteTree(ctx, params)) {
    commitWrite(
      ctx,
      changes,
      planned.params,
      planned.data,
      planned.mutable,
      effects,
      getCollectionMetadata(planned.params.collection),
    )
  }
  return { effects }
}

/** Commit nested relations in field order for observable staggered writes. */
function writeRelationTreeInOrder(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
  params: WriteItemParams,
  effects: EngineEffect[],
  path: WeakSet<object>,
  progress: { committed: boolean },
): void {
  validateWriteInput(params)
  if (path.has(params.item)) {
    throw new Error(`Cyclic nested relation detected in collection ${params.collection.name}`)
  }
  path.add(params.item)
  try {
    const metadata = getCollectionMetadata(params.collection)
    if (Object.isFrozen(params.item)) {
      commitWrite(ctx, changes, params, params.item, false, effects, metadata)
      progress.committed = true
      return
    }

    const rawData = pickNonSpecialProps(params.item, true)
    const data: Record<string, any> = {}
    for (const field in rawData) {
      const relation = params.collection.relations[field]
      if (!relation) {
        data[field] = rawData[field]
        continue
      }
      const relationValue = rawData[field]
      if (relationValue == null)
        continue
      validateRelationCardinality(params.collection, field, relation.many === true, relationValue)
      const children = relation.many ? relationValue as any[] : [relationValue]
      for (const childItem of children) {
        const childParams = resolveRelationWriteParams(ctx, {
          parentCollection: params.collection,
          relationKey: field,
          relation,
          childItem,
          meta: params.meta,
        })
        writeRelationTreeInOrder(ctx, changes, childParams, effects, path, progress)
      }
    }
    commitWrite(ctx, changes, params, data, true, effects, metadata)
    progress.committed = true
  }
  finally {
    path.delete(params.item)
  }
}

/** Commit one validated child or root write. */
export function commitWrite(
  ctx: EngineContext,
  changes: ChangeRecorder | undefined,
  params: WriteItemParams,
  data: any,
  mutable: boolean,
  effects: EngineEffect[] | undefined,
  metadata: CollectionMetadata,
  preparedState?: EngineCollectionState,
): void {
  const { collection, key, item, marker, fromRelation, fromWriteItems, meta } = params
  const state = preparedState ?? ctx.ensureCollection(collection.name)
  const id = toKeyId(key)
  const layerless = state.layers.length === 0
  const derivedKey = metadata.usesDefaultKey
    ? readDefaultKey(item)
    : collection.getKey(item)
  const itemOwnsKey = metadata.usesDefaultKey && (derivedKey !== undefined || ownsDefaultKey(item))
  const derivedKeyIsCanonical = matchesKeyId(derivedKey, id)
  const existing = state.base.get(id)
  const previousPublicKey = existing === undefined && !state.layeredKeyCounts?.has(id)
    ? undefined
    : layerless && metadata.usesDefaultKey && !state.keyOverrides
      ? readDefaultKey(existing) ?? id
      : getPublicKey(state, id, existing)
  const tombstone = ctx.tombstones.get(collection.name, key)
  if (tombstone) {
    if (params.fieldTimestamps && !shouldResurrect(tombstone, params.fieldTimestamps)) {
      return
    }
    ctx.tombstones.clear(collection.name, key)
  }
  if (derivedKeyIsCanonical)
    clearKeyOverride(state, id)
  else registerBaseKeyValue(state, key, derivedKey, itemOwnsKey || (!metadata.usesDefaultKey && derivedKey !== undefined))
  const publicKey = derivedKeyIsCanonical
    ? derivedKey
    : getPublicKey(state, id, existing)

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
  // Layered base writes can construct a fresh object while leaving visible
  // state unchanged. Layerless writes retain their historical notification
  // semantics, including same-value response refreshes.
  const visibleValueChanged = !fieldValuesEqual(previous, next)
  const keyFormChange = keyFormChanged && previousPublicKey !== undefined
    ? { previousKey: previousPublicKey, key: publicKey }
    : undefined
  if ((layerless ? mergedBase.valueChanged : visibleValueChanged) || keyFormChanged) {
    recordItem(
      changes,
      collection.name,
      id,
      next,
      keyFormChange,
    )
  }
  if (visibilityChanged || keyFormChanged) {
    invalidateVisibleKeys(state)
  }
  // A relation payload can replace an already-visible child. Vue list readers
  // need that child-first refresh before their parent relation publishes.
  if (visibilityChanged || keyFormChanged || (fromRelation && ctx.callbacks.stateChangeSink)) {
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
    appendWriteEffects(
      ctx,
      effects!,
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
    )
  }
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
/** Merge relation-free mutable data and defer any CRDT conflict hook. */
function mergeMutableItem(
  ctx: EngineContext,
  params: WriteItemParams,
  data: any,
  existing: any,
  publicKey: string | number,
  effects: EngineEffect[] | undefined,
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
    effects?.push({ type: 'conflict', payload: { collection, key: publicKey, conflicts } })
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
  clearKeyOverride(state, id)
  if (!layerless)
    invalidateResolvedItem(state, id)
  const next = layerless ? undefined : resolveItemById(state, id)
  if (getCollectionMetadata(collection).hasIndexes)
    reconcileItemIndexes(ctx, changes, collection, id, previous, next)
  const nextPublicKey = next === undefined ? publicKey : getPublicKey(state, id)
  const visibilityChanged = (previous !== undefined) !== (next !== undefined)
  const keyFormChanged = next !== undefined && publicKey !== nextPublicKey
  recordItem(
    changes,
    collection.name,
    id,
    next,
    keyFormChanged ? { previousKey: publicKey, key: nextPublicKey } : undefined,
  )
  if (visibilityChanged || keyFormChanged) {
    invalidateVisibleKeys(state)
    recordList(changes, collection.name)
  }
  releaseUnusedKey(state, id)
  return {
    removed: true,
    effects: createWriteEffects(ctx, {
      collection,
      key: publicKey,
      previousKey: publicKey,
      keyFormChanged,
      visibilityChanged,
      operation: 'delete',
    }),
  }
}
