import type { Collection, CollectionDefaults, FormOperation, ResolvedCollection, StoreSchema } from '@rstore/shared'
import { findLastIndex } from './utils/array'
import { itemsMatch } from './utils/items'

/**
 * Optimize a list of form operations to remove redundant work.
 */
export function optimizeOpLog<TData extends Record<string, any>>(
  operations: FormOperation<TData>[],
  collection?: ResolvedCollection<Collection, CollectionDefaults, StoreSchema>,
): FormOperation<TData>[] {
  const fieldGroups = new Map<string, FormOperation<TData>[]>()
  for (const op of operations) {
    const key = String(op.field)
    let group = fieldGroups.get(key)
    if (!group) {
      group = []
      fieldGroups.set(key, group)
    }
    group.push(op)
  }

  const result: FormOperation<TData>[] = []
  for (const [fieldName, ops] of fieldGroups) {
    const hasRelationOps = ops.some(op => op.type !== 'set')
    if (!hasRelationOps) {
      result.push(ops[ops.length - 1]!)
      continue
    }

    const relation = collection
      ? (collection.normalizedRelations as Record<string, any>)[fieldName]
      : undefined
    const isMany = relation?.many ?? true
    const pending: FormOperation<TData>[] = []

    for (const op of ops) {
      switch (op.type) {
        case 'set':
          pending.length = 0
          pending.push(op)
          break
        case 'connect':
          handleConnect(pending, op, isMany)
          break
        case 'disconnect':
          handleDisconnect(pending, op, isMany)
          break
      }
    }

    result.push(...pending)
  }

  result.sort((a, b) => a.timestamp - b.timestamp)
  return result
}

/**
 * Apply connect-operation simplification to a pending field op list.
 */
function handleConnect<TData extends Record<string, any>>(
  pending: FormOperation<TData>[],
  op: FormOperation<TData>,
  isMany: boolean,
) {
  if (!isMany) {
    const discIdx = findLastIndex(pending, p => p.type === 'disconnect')
    if (discIdx !== -1)
      pending.splice(discIdx, 1)
    const priorIdx = findLastIndex(pending, p => p.type === 'connect')
    if (priorIdx !== -1)
      pending.splice(priorIdx, 1)
    pending.push(op)
    return
  }

  const matchIdx = pending.findIndex(p =>
    p.type === 'disconnect'
    && p.oldValue != null
    && typeof p.oldValue === 'object'
    && !Array.isArray(p.oldValue)
    && itemsMatch(p.oldValue, op.newValue),
  )
  if (matchIdx !== -1)
    pending.splice(matchIdx, 1)
  else
    pending.push(op)
}

/**
 * Apply disconnect-operation simplification to a pending field op list.
 */
function handleDisconnect<TData extends Record<string, any>>(
  pending: FormOperation<TData>[],
  op: FormOperation<TData>,
  isMany: boolean,
) {
  if (!isMany) {
    const connIdx = findLastIndex(pending, p => p.type === 'connect')
    if (connIdx !== -1)
      pending.splice(connIdx, 1)
    else
      pending.push(op)
    return
  }

  if (op.oldValue != null && typeof op.oldValue === 'object' && !Array.isArray(op.oldValue)) {
    const matchIdx = pending.findIndex(p => p.type === 'connect' && itemsMatch(p.newValue, op.oldValue))
    if (matchIdx !== -1)
      pending.splice(matchIdx, 1)
    else
      pending.push(op)
  }
  else {
    pending.length = 0
    pending.push(op)
  }
}
