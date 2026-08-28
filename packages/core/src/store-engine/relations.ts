import type { ResolvedCollection } from '@rstore/shared'
import type { EngineContext } from './internal-types.js'
import type { WriteItemForRelationParams, WriteItemParams } from './types.js'
import { pickNonSpecialProps } from '@rstore/shared'
import { isKeyDefined } from '../key.js'

/** Fully validated child-first write step. */
export interface PlannedWrite {
  /** Original write parameters. */
  params: WriteItemParams
  /** Relation-free mutable data, or the original frozen item. */
  data: any
  /** Whether `data` should merge with existing base data. */
  mutable: boolean
  /** Whether this step represents the public root write. */
  root: boolean
}

/** Resolve a related child through the engine's single canonical path. */
export function resolveRelationWriteParams(
  ctx: EngineContext,
  params: WriteItemForRelationParams,
): WriteItemParams {
  const { parentCollection, relationKey, relation, childItem, meta } = params
  const possibleNames = Object.keys(relation.to)
  const collection = ctx.callbacks.resolveChildCollection(childItem, possibleNames)
  if (!collection || !possibleNames.includes(collection.name)) {
    throw new Error(`Could not determine type for relation ${parentCollection.name}.${String(relationKey)}`)
  }
  const key = collection.getKey(childItem)
  if (!isKeyDefined(key)) {
    throw new Error(`Could not determine key for relation ${parentCollection.name}.${String(relationKey)}`)
  }
  return { collection, key, item: childItem, meta }
}

/** Validate a complete nested relation tree and return child-first writes. */
export function planWriteTree(ctx: EngineContext, params: WriteItemParams): PlannedWrite[] {
  const result: PlannedWrite[] = []
  const path = new WeakSet<object>()
  planWrite(ctx, params, true, path, result)
  return result
}

/** Recursively validate one write without mutating engine state. */
function planWrite(
  ctx: EngineContext,
  params: WriteItemParams,
  root: boolean,
  path: WeakSet<object>,
  result: PlannedWrite[],
): void {
  validateWriteInput(params)
  if (path.has(params.item)) {
    throw new Error(`Cyclic nested relation detected in collection ${params.collection.name}`)
  }

  path.add(params.item)
  try {
    if (Object.isFrozen(params.item)) {
      result.push({ params, data: params.item, mutable: false, root })
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
      if (relationValue == null) {
        continue
      }
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
        planWrite(ctx, childParams, false, path, result)
      }
    }
    result.push({ params, data, mutable: true, root })
  }
  finally {
    path.delete(params.item)
  }
}

/** Validate key and item shape before relation planning or mutation. */
export function validateWriteInput(params: WriteItemParams): void {
  if (!isKeyDefined(params.key)) {
    throw new TypeError(`Item key is required for collection ${params.collection.name}`)
  }
  if (!params.item || typeof params.item !== 'object') {
    throw new TypeError(`Expected object item for collection ${params.collection.name}`)
  }
}

/** Reject malformed to-one and to-many payload shapes deterministically. */
function validateRelationCardinality(
  collection: ResolvedCollection<any, any, any>,
  field: string,
  many: boolean,
  value: unknown,
): void {
  if (many && !Array.isArray(value)) {
    throw new TypeError(`Expected array for relation ${collection.name}.${field}`)
  }
  if (!many && (Array.isArray(value) || typeof value !== 'object')) {
    throw new TypeError(`Expected object for relation ${collection.name}.${field}`)
  }
}
