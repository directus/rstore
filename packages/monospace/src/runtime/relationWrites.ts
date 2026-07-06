import type { FormOperation } from '@rstore/shared'
import type { MonospaceRelationCollectionLike, MonospaceRelationStoreLike, MonospaceRelationTargetLike } from './relations'
import type { MonospaceRelationCachePatch } from './relationWritesCache'
import type { MonospaceConnectEntry } from './relationWriteUtils'
import { getMonospacePrimaryKeys, getMonospaceRelationConnectKeys } from './collection'
import { toArray } from './relations'
import { buildConnectEntry, isMonospaceOperationPayload, pickItemColumns, relatedItemsMatch } from './relationWriteUtils'

/**
 * Mutation mode of a Monospace relational write.
 *
 * Create bodies carry a single operation object per relation field while
 * update bodies carry an array of operation objects, matching the payloads
 * accepted by the Monospace relational data API.
 */
export type MonospaceMutationMode = 'create' | 'update'

/**
 * Options accepted by {@link buildMonospaceRelationWrites}.
 */
export interface MonospaceRelationWriteOptions {
  /**
   * Store used to resolve target collections and current cache state.
   */
  store?: MonospaceRelationStoreLike

  /**
   * Mutated collection.
   */
  collection: MonospaceRelationCollectionLike

  /**
   * Mutation body before translation.
   */
  item: Record<string, any>

  /**
   * Form operations recorded by the rstore form object, if any.
   */
  formOperations?: FormOperation[]

  /**
   * Whether the mutation creates or updates the item.
   */
  mode: MonospaceMutationMode

  /**
   * Key of the updated item, used to resolve current related items.
   */
  key?: string | number
}

/**
 * Result of translating form relation operations into Monospace wire shapes.
 */
export interface MonospaceRelationWrites {
  /**
   * Mutation body with relation writes applied: FK column values for to-one
   * relations and Monospace operation payloads for to-many relations.
   */
  item: Record<string, any>

  /**
   * Cache patches to apply after the mutation succeeds.
   */
  patches: MonospaceRelationCachePatch[]
}

/**
 * Translates rstore form relation operations (`connect`, `disconnect`,
 * many-relation `set`) into Monospace mutation body writes.
 *
 * To-one operations write the real FK columns of the relation (resolving
 * missing referenced column values from the cache); no `_connect` /
 * `_disconnect` operation is emitted since the FK column write alone is the
 * canonical, unambiguous form. To-many operations are translated into
 * Monospace `_connect`/`_disconnect` operations, as no source columns exist
 * for them. Fields carrying user-assigned relation payloads (already present
 * on the body or op-shaped values) pass through untouched. To-many
 * disconnect operations are dropped in create mode, where Monospace only
 * accepts `_create` and `_connect`.
 */
export function buildMonospaceRelationWrites(options: MonospaceRelationWriteOptions): MonospaceRelationWrites {
  const item = { ...options.item }
  const patches: MonospaceRelationCachePatch[] = []
  if (!options.formOperations?.length) {
    return { item, patches }
  }

  const relations = options.collection.normalizedRelations ?? {}
  for (const relationKey in relations) {
    const relation = relations[relationKey]
    // Only unambiguous single-target relations can be translated.
    if (!relation || relation.to.length !== 1) {
      continue
    }
    const ops = options.formOperations.filter(op => String(op.field) === relationKey)
    if (!ops.length) {
      continue
    }
    // User-assigned relation payloads pass through untouched.
    if (item[relationKey] !== undefined || ops.some(op => isMonospaceOperationPayload(op.newValue))) {
      continue
    }

    const target = relation.to[0]!
    if (relation.many) {
      translateToManyField({ ...options, item, ops, patches, relationKey, target })
    }
    else {
      translateToOneField({ ...options, item, ops, patches, relationKey, target })
    }
  }

  return { item, patches }
}

/**
 * Context shared by the per-field translation helpers.
 */
export interface MonospaceFieldTranslationContext extends MonospaceRelationWriteOptions {
  item: Record<string, any>
  ops: FormOperation[]
  patches: MonospaceRelationCachePatch[]
  relationKey: string
  target: MonospaceRelationTargetLike
}

/**
 * Translates the operations of one to-one relation field into FK column
 * writes on the mutation body.
 *
 * The relation `on` mapping pairs the referenced target columns with the FK
 * columns on the mutated item, so a connect assigns
 * `item[fkColumn] = related[referencedColumn]` and a disconnect assigns
 * `null`. Referenced column values missing from the connect payload are
 * resolved from the cached target item; when they cannot be resolved the
 * mutation fails rather than sending an incomplete FK.
 */
function translateToOneField(ctx: MonospaceFieldTranslationContext): void {
  const { item, ops, relationKey, store, target } = ctx
  const targetCollection = store?.$collections?.find(other => other.name === target.collection)
  const pairs = Object.entries(target.on)

  for (const op of ops) {
    if (op.type === 'connect') {
      // All referenced columns are required to write a complete FK value.
      const entry = buildConnectEntry(ctx, targetCollection, op.newValue, Object.keys(target.on), Object.keys(target.on), 'all')
      for (const [targetField, sourceField] of pairs) {
        if (sourceField !== relationKey) {
          item[sourceField] = entry.item[targetField]
        }
      }
    }
    else if (op.type === 'disconnect') {
      for (const [, sourceField] of pairs) {
        if (sourceField !== relationKey) {
          item[sourceField] = null
        }
      }
    }
  }
}

/**
 * Translates the operations of one to-many relation field.
 */
function translateToManyField(ctx: MonospaceFieldTranslationContext): void {
  const { collection, item, mode, ops, patches, relationKey, store, target } = ctx
  const targetCollection = store?.$collections?.find(other => other.name === target.collection)
  const targetPrimaryKeys = targetCollection ? getMonospacePrimaryKeys(targetCollection) : ['id']
  const connectKeys = getMonospaceRelationConnectKeys(collection, relationKey) ?? targetPrimaryKeys
  const matchColumns = [...new Set([...targetPrimaryKeys, ...connectKeys])]

  let added: MonospaceConnectEntry[] = []
  let removed: Array<Record<string, any>> = []
  let disconnectAll = false

  for (const op of ops) {
    if (op.type === 'connect') {
      const entry = buildConnectEntry(ctx, targetCollection, op.newValue, connectKeys, targetPrimaryKeys)
      removed = removed.filter(other => !relatedItemsMatch(other, entry.item, matchColumns))
      if (!added.some(other => relatedItemsMatch(other.item, entry.item, matchColumns))) {
        added.push(entry)
      }
    }
    else if (op.type === 'disconnect' && op.oldValue && typeof op.oldValue === 'object' && !Array.isArray(op.oldValue)) {
      // Targeted disconnect filters stay strictly primary-key based so a
      // partial filter can never over-match unrelated items.
      const entry = buildConnectEntry(ctx, targetCollection, op.oldValue, targetPrimaryKeys, targetPrimaryKeys, 'all')
      added = added.filter(other => !relatedItemsMatch(other.item, entry.item, matchColumns))
      if (!removed.some(other => relatedItemsMatch(other, entry.item, matchColumns))) {
        removed.push(entry.item)
      }
    }
    else if (op.type === 'disconnect') {
      disconnectAll = true
      added = []
      removed = []
    }
    else {
      // `$set` replaces all related items: decompose into connects and
      // disconnects relative to the current cache state.
      const newEntries = toArray(op.newValue as any[]).map(value => buildConnectEntry(ctx, targetCollection, value, connectKeys, targetPrimaryKeys))
      const currentItems = resolveCurrentTargetItems(ctx, targetCollection, targetPrimaryKeys)
      disconnectAll = false
      added = newEntries.filter(entry => !currentItems.some(other => relatedItemsMatch(other, entry.item, matchColumns)))
      removed = currentItems.filter(other => !newEntries.some(entry => relatedItemsMatch(other, entry.item, matchColumns)))
    }
  }

  if (disconnectAll) {
    removed = resolveCurrentTargetItems(ctx, targetCollection, targetPrimaryKeys)
  }
  const removedKeys = removed
    .map(other => pickItemColumns(other, targetPrimaryKeys))
    .filter((key): key is Record<string, any> => !!key)

  const wireOps: Array<Record<string, any>> = []
  if (mode === 'update') {
    if (disconnectAll) {
      wireOps.push({ _disconnect: {} })
    }
    else if (removedKeys.length) {
      wireOps.push({ _disconnect: { filter: removedKeys.length === 1 ? removedKeys[0] : { _or: removedKeys } } })
    }
  }
  if (added.length) {
    wireOps.push({ _connect: { keys: added.map(entry => entry.key) } })
  }
  if (wireOps.length) {
    item[relationKey] = mode === 'create' ? wireOps[0] : wireOps
  }

  for (const key of removedKeys) {
    patches.push({ connected: false, on: target.on, targetCollection: target.collection, targetKeyFields: key, type: 'to-many' })
  }
  for (const entry of added) {
    // Skip the FK column patch when the target primary keys are unknown
    // (item connected through non-PK columns and not cached).
    const key = pickItemColumns(entry.item, targetPrimaryKeys)
    if (key) {
      patches.push({ connected: true, on: target.on, targetCollection: target.collection, targetKeyFields: key, type: 'to-many' })
    }
  }
}

/**
 * Resolves the currently related target items from the cache.
 *
 * The related items are matched through the real FK columns of the relation
 * `on` mapping, like the relation accessors do. Items missing from the cache
 * are not returned, so `$set` decomposition only disconnects known items.
 */
function resolveCurrentTargetItems(
  ctx: MonospaceFieldTranslationContext,
  targetCollection: MonospaceRelationCollectionLike | undefined,
  targetPrimaryKeys: string[],
): Array<Record<string, any>> {
  const { collection, key, mode, store, target } = ctx
  if (mode === 'create' || !targetCollection || !store?.$cache?.readItems) {
    return []
  }

  // Resolve the parent-side join column values from the cached parent item,
  // or from the mutation key directly when the relation joins on the single
  // primary key.
  const sourceFields = [...new Set(Object.values(target.on))]
  const sourcePrimaryKeys = getMonospacePrimaryKeys(collection)
  const parentItem = key != null ? store.$cache.readItem?.({ collection, key }) : undefined
  let parentValues: Record<string, any> | undefined
  if (parentItem) {
    parentValues = Object.fromEntries(sourceFields.map(field => [field, parentItem[field]]))
  }
  else if (key != null && sourcePrimaryKeys.length === 1 && sourceFields.length === 1 && sourceFields[0] === sourcePrimaryKeys[0]) {
    parentValues = { [sourceFields[0]!]: key }
  }
  if (!parentValues || Object.values(parentValues).some(value => value == null)) {
    return []
  }

  const items = store.$cache.readItems({
    collection: targetCollection,
    filter: item => Object.entries(target.on).every(([targetField, sourceField]) => {
      return item[targetField] === parentValues[sourceField]
    }),
  })
  return items.filter(item => targetPrimaryKeys.every(field => item[field] != null))
}
