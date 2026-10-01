import type { MonospaceRelationCollectionLike, MonospaceRelationTargetLike } from './relations'
import type { MonospaceFieldTranslationContext, MonospaceMutationMode } from './relationWrites'
import { getMonospacePrimaryKeys, getMonospaceRelationConnectKeys, getMonospaceRelationForward } from './collection'
import { buildConnectEntry } from './relationWriteUtils'

/**
 * Returns whether a to-one relation is the backward side of a FK
 * constraint, meaning the FK columns are owned by the target collection.
 *
 * Generated collections declare the direction in their relation meta
 * (`forward`), resolved from the schema metadata. Hand-written collections
 * without it fall back to inferring the direction from the `on` mapping: a
 * relation joining on exactly the source primary key columns is treated as
 * backward (for example `Profiles.settings` with `on: { profile_id: 'id' }`).
 * The inference is wrong for one-to-one relations whose FK columns are also
 * the whole source primary key, hence the meta taking precedence.
 */
export function isBackwardToOneRelation(
  collection: MonospaceRelationCollectionLike,
  relationKey: string,
  target: MonospaceRelationTargetLike,
): boolean {
  const forward = getMonospaceRelationForward(collection, relationKey)
  if (forward != null) {
    return !forward
  }
  const sourceFields = new Set(Object.values(target.on))
  const primaryKeys = getMonospacePrimaryKeys(collection)
  return sourceFields.size === primaryKeys.length && primaryKeys.every(field => sourceFields.has(field))
}

/**
 * Translates FK column values supplied on a create body into a to-one
 * `_connect` operation.
 *
 * Monospace create inputs reject the FK columns of a relation (`Unknown
 * input field`) and require the relation field instead, so the columns are
 * removed and, when every column holds a value, replaced by
 * `{ <relation>: { _connect: { key } } }` keyed by the referenced columns.
 * Null columns mean "no related item" and are simply omitted. Values are
 * read from `source` so FK columns shared by several relations stay
 * available after the first translation removed them from `item`.
 */
export function translateCreateFkColumns(
  item: Record<string, any>,
  source: Record<string, any>,
  relationKey: string,
  target: MonospaceRelationTargetLike,
): void {
  const pairs = Object.entries(target.on).filter(([, sourceField]) => sourceField !== relationKey)
  if (!pairs.some(([, sourceField]) => sourceField in source)) {
    return
  }

  const key: Record<string, any> = {}
  for (const [targetField, sourceField] of pairs) {
    key[targetField] = source[sourceField]
    delete item[sourceField]
  }
  if (Object.values(key).every(value => value != null)) {
    item[relationKey] = { _connect: { key } }
  }
}

/**
 * Translates the form operations of one to-one relation field.
 *
 * Forward relations in update mode write the real FK columns (`item[fk] =
 * related[referenced]`, `null` on disconnect), which Monospace update inputs
 * accept. Create inputs reject FK columns, so create mode emits a single
 * `{ _connect: { key } }` object keyed by the referenced columns and drops
 * the FK columns (a disconnect simply omits the relation). Backward
 * relations own no source columns and always use nested operations:
 * `_connect` (single object on create, array on update) and
 * `[{ _disconnect: {} }]` on update. Referenced column values missing from
 * the connect payload are resolved from the cached target item; when they
 * cannot be resolved the mutation fails rather than sending an incomplete
 * key.
 */
export function translateToOneField(ctx: MonospaceFieldTranslationContext): void {
  const { collection, item, mode, ops, relationKey, store, target } = ctx
  const targetCollection = store?.$collections?.find(other => other.name === target.collection)
  const backward = isBackwardToOneRelation(collection, relationKey, target)
  // FK columns owned by the mutated item (forward relations only).
  const pairs = backward ? [] : Object.entries(target.on).filter(([, sourceField]) => sourceField !== relationKey)
  // Forward connect keys are the referenced columns; backward ones come from
  // the generated connect key metadata, falling back to the target primary
  // keys.
  const keyColumns = backward
    ? getMonospaceRelationConnectKeys(collection, relationKey) ?? (targetCollection ? getMonospacePrimaryKeys(targetCollection) : ['id'])
    : Object.keys(target.on)

  for (const op of ops) {
    if (op.type === 'connect') {
      // Forward connects need every referenced column to write a complete
      // FK value; backward connect inputs accept any unique column subset.
      const entry = buildConnectEntry(ctx, targetCollection, op.newValue, keyColumns, keyColumns, backward ? 'some' : 'all')
      if (backward || mode === 'create') {
        removeColumns(item, pairs)
        item[relationKey] = wrapOperation(mode, { _connect: { key: entry.key } })
      }
      else {
        for (const [targetField, sourceField] of pairs) {
          item[sourceField] = entry.item[targetField]
        }
      }
    }
    else if (op.type === 'disconnect') {
      if (mode === 'create') {
        // Nothing to unlink on a new item: omit the relation entirely.
        removeColumns(item, pairs)
        delete item[relationKey]
      }
      else if (backward) {
        item[relationKey] = [{ _disconnect: {} }]
      }
      else {
        for (const [, sourceField] of pairs) {
          item[sourceField] = null
        }
      }
    }
  }
}

/**
 * Wraps a to-one operation in the shape expected by the mutation mode: a
 * single object on create, a one-item array on update.
 */
function wrapOperation(mode: MonospaceMutationMode, operation: Record<string, any>): Record<string, any> | Array<Record<string, any>> {
  return mode === 'create' ? operation : [operation]
}

/**
 * Removes the FK columns of a relation from a mutation body.
 */
function removeColumns(item: Record<string, any>, pairs: Array<[string, string]>): void {
  for (const [, sourceField] of pairs) {
    delete item[sourceField]
  }
}
