import type { Collection, CollectionDefaults, FormOperation, ResolvedCollection, StoreSchema } from '@rstore/shared'
import { leafFieldName } from './utils/fieldPath'
import { itemsMatch } from './utils/items'

/**
 * Apply a single operation to a projected form state.
 */
export function applyOp<TData extends Record<string, any>>(
  target: Record<string, any>,
  op: FormOperation<TData>,
  collection?: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>,
) {
  const fieldStr = String(op.field)
  const relation = collection
    ? (collection.normalizedRelations as Record<string, any>)[fieldStr]
    : undefined

  switch (op.type) {
    case 'set':
      if (relation?.many) {
        target[`_$${fieldStr}Data`] = Array.isArray(op.newValue) ? [...op.newValue] : op.newValue
      }
      else {
        target[fieldStr] = op.newValue
      }
      break
    case 'connect':
      applyConnect(target, op, relation, fieldStr)
      break
    case 'disconnect':
      applyDisconnect(target, op, relation, fieldStr)
      break
  }
}

/**
 * Project a relation connect operation into form state.
 */
function applyConnect<TData extends Record<string, any>>(
  target: Record<string, any>,
  op: FormOperation<TData>,
  relation: any,
  fieldStr: string,
) {
  if (!relation)
    return
  if (relation.many) {
    const dataKey = `_$${fieldStr}Data`
    if (!Array.isArray(target[dataKey]))
      target[dataKey] = []
    target[dataKey].push(op.newValue)
    return
  }

  for (const to of relation.to) {
    for (const [targetField, sourceField] of Object.entries(to.on)) {
      const sourceFieldName = leafFieldName(sourceField as string)
      const targetFieldName = leafFieldName(targetField)
      if (op.newValue?.[targetFieldName] !== undefined) {
        target[sourceFieldName] = op.newValue[targetFieldName]
      }
    }
  }
}

/**
 * Project a relation disconnect operation into form state.
 */
function applyDisconnect<TData extends Record<string, any>>(
  target: Record<string, any>,
  op: FormOperation<TData>,
  relation: any,
  fieldStr: string,
) {
  if (!relation)
    return
  if (relation.many) {
    const dataKey = `_$${fieldStr}Data`
    if (op.oldValue && typeof op.oldValue === 'object' && !Array.isArray(op.oldValue)) {
      const current = target[dataKey] || []
      const idx = current.findIndex((item: any) => itemsMatch(item, op.oldValue))
      if (idx !== -1)
        current.splice(idx, 1)
    }
    else {
      target[dataKey] = []
    }
    return
  }

  for (const to of relation.to) {
    for (const [, sourceField] of Object.entries(to.on)) {
      target[leafFieldName(sourceField as string)] = null
    }
  }
}
