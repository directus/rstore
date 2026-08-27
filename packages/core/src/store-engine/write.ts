import type { FieldTimestamps } from '@rstore/shared'
import type { DeleteItemParams, EngineContext, WriteItemForRelationParams, WriteItemParams } from './types.js'
import { pickNonSpecialProps } from '@rstore/shared'
import { mergeItemFields } from '../crdt/index.js'
import { isKeyDefined } from '../key.js'
import { shouldResurrect } from '../tombstone.js'
import { getPublicKey, registerKey, releaseUnusedKey, toKeyId } from './identity.js'
import { reconcileItemIndexes } from './indexes.js'
import { invalidateResolvedItem, invalidateVisibleKeys, resolveItemById } from './view.js'

/** Get or create field timestamps for one collection. */
function ensureCollectionTimestamps(ctx: EngineContext, collectionName: string): Map<string, FieldTimestamps> {
  let timestamps = ctx.fieldTimestamps.get(collectionName)
  if (!timestamps) {
    timestamps = new Map()
    ctx.fieldTimestamps.set(collectionName, timestamps)
  }
  return timestamps
}

/** Read field timestamps using canonical string/number key identity. */
export function getFieldTimestamps(ctx: EngineContext, collectionName: string, key: string | number): FieldTimestamps | undefined {
  return ctx.fieldTimestamps.get(collectionName)?.get(toKeyId(key))
}

/** Store field timestamps using canonical string/number key identity. */
export function setFieldTimestamps(ctx: EngineContext, collectionName: string, key: string | number, timestamps: FieldTimestamps): void {
  const id = toKeyId(key)
  const state = ctx.collections.get(collectionName)
  if (state && !state.keyValues.has(id)) {
    state.keyValues.set(id, key)
  }
  ensureCollectionTimestamps(ctx, collectionName).set(id, timestamps)
}

/** Resolve and write a nested relation item into its target collection. */
export function writeItemForRelationNow(ctx: EngineContext, params: WriteItemForRelationParams): void {
  const { parentCollection, relationKey, relation, childItem, meta } = params
  const nestedItemCollection = ctx.callbacks.resolveChildCollection(childItem, Object.keys(relation.to))
  if (!nestedItemCollection) {
    throw new Error(`Could not determine type for relation ${parentCollection.name}.${String(relationKey)}`)
  }
  const nestedKey = nestedItemCollection.getKey(childItem)
  if (!isKeyDefined(nestedKey)) {
    throw new Error(`Could not determine key for relation ${parentCollection.name}.${String(relationKey)}`)
  }
  writeItemNow(ctx, { collection: nestedItemCollection, key: nestedKey, item: childItem, meta })
}

/** Write a non-frozen item after extracting and caching its nested relations. */
function writeMutableItem(ctx: EngineContext, params: WriteItemParams, existing: any): any {
  const { collection, item, meta } = params
  const rawData = pickNonSpecialProps(item, true)
  const data: Record<string, any> = {}

  for (const field in rawData) {
    if (!(field in collection.relations)) {
      data[field] = rawData[field]
      continue
    }
    const relation = collection.relations[field]
    const rawItem = rawData[field]
    if (!rawItem || !relation) {
      continue
    }
    if (relation.many && !Array.isArray(rawItem)) {
      throw new Error(`Expected array for relation ${collection.name}.${field}`)
    }
    if (!relation.many && Array.isArray(rawItem)) {
      throw new Error(`Expected object for relation ${collection.name}.${field}`)
    }
    for (const childItem of Array.isArray(rawItem) ? rawItem : [rawItem]) {
      writeItemForRelationNow(ctx, {
        parentCollection: collection,
        relationKey: field,
        relation,
        childItem,
        meta,
      })
    }
  }

  if (!existing) {
    if (params.fieldTimestamps) {
      setFieldTimestamps(ctx, collection.name, params.key, { ...params.fieldTimestamps })
    }
    return data
  }
  if (!params.fieldTimestamps) {
    return { ...existing, ...data }
  }

  const localTimestamps = getFieldTimestamps(ctx, collection.name, params.key) ?? {}
  const { merged, mergedTimestamps, conflicts } = mergeItemFields(
    existing,
    data,
    localTimestamps,
    params.fieldTimestamps,
  )
  setFieldTimestamps(ctx, collection.name, params.key, mergedTimestamps)
  if (conflicts.length > 0) {
    ctx.callbacks.onConflict?.({ collection, key: params.key, conflicts })
  }
  return merged
}

/** Apply one item write and reconcile indexes against its final visible value. */
export function writeItemNow(ctx: EngineContext, params: WriteItemParams): void {
  const { collection, key, item, marker, fromWriteItems, meta } = params
  const state = ctx.ensureCollection(collection.name)
  const previousPublicKey = state.keyValues.get(toKeyId(key))
  const id = registerKey(state, collection, key, item)
  const publicKey = getPublicKey(state, id)
  const tombstone = ctx.tombstones.get(collection.name, publicKey)
  if (tombstone) {
    if (params.fieldTimestamps && !shouldResurrect(tombstone, params.fieldTimestamps)) {
      return
    }
    ctx.tombstones.clear(collection.name, publicKey)
  }

  const previous = resolveItemById(state, id)
  const existing = state.base.get(id)
  const nextBase = Object.isFrozen(item)
    ? item
    : writeMutableItem(ctx, { ...params, key: publicKey }, existing)
  state.base.set(id, nextBase)

  invalidateResolvedItem(state, id)
  const next = resolveItemById(state, id)
  reconcileItemIndexes(ctx, collection, id, previous, next)
  ctx.observers.touchItem(collection.name, id)
  const visibilityChanged = (previous !== undefined) !== (next !== undefined)
  const visibleKeyFormChanged = previousPublicKey !== undefined
    && previousPublicKey !== publicKey
    && (previous !== undefined || next !== undefined)
  if (visibilityChanged || visibleKeyFormChanged) {
    invalidateVisibleKeys(state)
    ctx.observers.touchList(collection.name)
  }

  if (marker) {
    ctx.markers[marker] = true
    ctx.observers.touchList(collection.name)
  }
  if (meta?.$queryTracking) {
    meta.$queryTracking.items[collection.name] ??= new Set()
    meta.$queryTracking.items[collection.name]!.add(publicKey)
  }
  if (!fromWriteItems) {
    ctx.callbacks.onAfterWrite?.({ collection, key: publicKey, result: [item], marker, operation: 'write' })
  }
}

/** Delete one base item and reconcile indexes against its next visible value. */
export function deleteItemFromBase(ctx: EngineContext, params: DeleteItemParams): boolean {
  const { collection, key } = params
  const state = ctx.collections.get(collection.name)
  if (!state) {
    return false
  }
  const id = toKeyId(key)
  if (state.base.get(id) === undefined) {
    return false
  }

  const previous = resolveItemById(state, id)
  const publicKey = getPublicKey(state, id)
  state.base.delete(id)
  invalidateResolvedItem(state, id)
  const next = resolveItemById(state, id)
  reconcileItemIndexes(ctx, collection, id, previous, next)
  ctx.observers.touchItem(collection.name, id)
  if ((previous !== undefined) !== (next !== undefined)) {
    invalidateVisibleKeys(state)
    ctx.observers.touchList(collection.name)
  }
  ctx.callbacks.onAfterWrite?.({ collection, key: publicKey, operation: 'delete' })
  releaseUnusedKey(state, id)
  return true
}
