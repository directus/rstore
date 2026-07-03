import type { FormOperation, StandardSchemaV1 } from '@rstore/shared'
import type { FormObjectRuntime } from './context'
import { isKeyDefined } from '@rstore/core'
import { isPublicKey } from '@rstore/shared'
import { optimizeOpLog } from './opLog'
import { formFieldValuesEqual, isRelationField, pickRelationRawPayload, queueChange, recordAndApplyOp, updateChangedProps } from './state'
import { leafFieldName } from './utils/fieldPath'
import { itemsMatch } from './utils/items'
import { createRelationPayloadField, getInitialRelationData } from './utils/relationPayload'

/**
 * Create the proxy that tracks field writes and resolves relation reads.
 */
export function createFormProxy<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(ctx: FormObjectRuntime<TData, TSchema, TResult>) {
  return new Proxy(ctx.form, {
    set(_target, key, value) {
      const isPublicFormKey = isPublicKey(key)
      const isRelationKey = typeof key === 'string'
        && isPublicFormKey
        && !!ctx.options.collection
        && key in (ctx.options.collection.normalizedRelations as Record<string, any>)

      if (isRelationKey) {
        return setRelationPayload(ctx, key, value)
      }

      const shouldRecordSet = typeof key === 'string' && isPublicFormKey

      if (shouldRecordSet) {
        const currentValue = ctx.form[key]
        ctx.redoStack.length = 0
        ctx.opLog.push({
          timestamp: Date.now(),
          field: key as keyof TData,
          type: 'set',
          newValue: value,
          oldValue: currentValue,
        })

        const initialValue = ctx.initialData[key as keyof typeof ctx.initialData]
        if (!formFieldValuesEqual(value, initialValue)) {
          ctx.form.$changedProps[key as keyof TData] = [value, initialValue] as [TData[keyof TData], TData[keyof TData]]
          ctx.changedSinceLastHandled[key as keyof TData] = [value, initialValue] as [TData[keyof TData], TData[keyof TData]]
        }
        else {
          delete ctx.form.$changedProps[key]
          delete ctx.changedSinceLastHandled[key]
        }
        queueChange(ctx)
      }
      return Reflect.set(ctx.form, key, value)
    },
    get(_target, key) {
      return Reflect.get(ctx.form, key)
    },
    ownKeys() {
      return Reflect.ownKeys(ctx.form).filter(key =>
        isPublicKey(key)
        && (typeof key !== 'string' || !isRelationField(ctx, key) || !!pickRelationRawPayload(ctx.form[key])),
      )
    },
  })
}

/**
 * Install relation methods on the form object.
 */
export function installRelationMethods<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(ctx: FormObjectRuntime<TData, TSchema, TResult>) {
  if (!ctx.options.collection)
    return
  for (const [relationKey, relation] of Object.entries(ctx.options.collection.normalizedRelations)) {
    const relationDataKey = `_$${relationKey}Data`
    const initialValue = ctx.initialData[relationKey as keyof typeof ctx.initialData]
    ctx.form[relationDataKey] = getInitialRelationData(relation)
    const relationApi = createRelationApi(ctx, relationKey, relation, relationDataKey)
    ctx.relationMethods[relationKey] = relationApi
    ctx.form[relationKey] = createRelationPayloadField(relationApi, initialValue)
  }
}

/**
 * Create the non-enumerable relation API attached to relation payload fields.
 */
function createRelationApi<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(ctx: FormObjectRuntime<TData, TSchema, TResult>, relationKey: string, relation: any, relationDataKey: string) {
  const relationApi = {}
  Object.defineProperties(relationApi, {
    $connect: {
      value: (item: Record<string, any>) => {
        recordAndApplyOp(ctx, { field: relationKey as keyof TData, type: 'connect', newValue: item, oldValue: undefined })
      },
    },
    $disconnect: {
      value: (item?: Record<string, any>) => {
        const found = relation.many && item ? findDisconnectTarget(ctx, relationKey, relationDataKey, item) : undefined
        if (relation.many && item && found) {
          recordAndApplyOp(ctx, { field: relationKey as keyof TData, type: 'disconnect', newValue: undefined, oldValue: found })
        }
        else if (relation.many && !item) {
          recordAndApplyOp(ctx, { field: relationKey as keyof TData, type: 'disconnect', newValue: [], oldValue: [...(ctx.form[relationDataKey] || [])] })
        }
        else if (!relation.many) {
          recordAndApplyOp(ctx, { field: relationKey as keyof TData, type: 'disconnect', newValue: undefined, oldValue: undefined })
        }
      },
    },
    $set: {
      value: (items: Array<Record<string, any>>) => {
        if (relation.many) {
          recordAndApplyOp(ctx, { field: relationKey as keyof TData, type: 'set', newValue: [...items], oldValue: [...(ctx.form[relationDataKey] || [])] })
        }
        else if (items.length > 0 && items[0]) {
          ;(relationApi as any).$connect(items[0])
        }
        else {
          ;(relationApi as any).$disconnect()
        }
      },
    },
    $value: {
      get: () => resolveRelationValue(ctx, relationKey, relation),
    },
  })
  return relationApi
}

/**
 * Replace a relation field with the assigned user-owned payload.
 */
function setRelationPayload<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(ctx: FormObjectRuntime<TData, TSchema, TResult>, key: string, value: any) {
  if (value === ctx.form[key])
    return true

  const currentRelationField = ctx.form[key] ?? ctx.relationMethods[key]
  const oldValue = pickRelationRawPayload(currentRelationField, true)
  const relationField = createRelationPayloadField(ctx.relationMethods[key], value)
  const op: FormOperation<TData> = {
    timestamp: Date.now(),
    field: key as keyof TData,
    type: 'set',
    newValue: relationField,
    oldValue,
  }
  ctx.redoStack.length = 0
  ctx.relationPayloadSetOps.add(op)
  ctx.opLog.push(op)
  Reflect.set(ctx.form, key, relationField)
  updateChangedProps(ctx)
  ctx.changedSinceLastHandled = { ...ctx.form.$changedProps }
  queueChange(ctx)
  return true
}

/**
 * Resolve the current value for a relation field.
 */
function resolveRelationValue<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  key: string,
  relation: any,
) {
  if (!ctx.options.store)
    return relation.many ? [] : null
  if (!relation.many)
    return resolveRelationFromCache(ctx, relation, false) ?? null
  const cacheItems = resolveRelationFromCache(ctx, relation, true)
  return applyFormOpsToManyRelation(ctx, key, relation, cacheItems as any[])
}

/**
 * Find an item to disconnect from local relation data or resolved cache data.
 */
function findDisconnectTarget<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  relationKey: string,
  relationDataKey: string,
  item: Record<string, any>,
) {
  const current = ctx.form[relationDataKey]
  if (Array.isArray(current)) {
    const found = current.find((currentItem: any) => itemsMatch(currentItem, item))
    if (found)
      return found
  }
  if (!ctx.options.store || !ctx.options.collection)
    return undefined
  const normalizedRelation = (ctx.options.collection.normalizedRelations as Record<string, any>)[relationKey]
  const cacheMatch = normalizedRelation
    ? (resolveRelationFromCache(ctx, normalizedRelation, true) as any[]).find((cacheItem: any) => itemsMatch(cacheItem, item))
    : undefined
  return cacheMatch ? item : undefined
}

/**
 * Resolve related items from cache using relation metadata.
 */
function resolveRelationFromCache<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  relation: any,
  many: boolean,
) {
  const store = ctx.options.store!
  const result: any[] = []
  for (const target of relation.to) {
    const targetCollection = store.$collections.find((m: any) => m.name === target.collection)
    if (!targetCollection)
      continue
    const indexKeys = Object.keys(target.on).sort()
    const indexValue = indexKeys.map((k: string) => ctx.form[leafFieldName(target.on[k]! as string)])
    if (indexValue.every((v: any) => v != null)) {
      result.push(...store.$cache.readItems({
        collection: targetCollection as any,
        indexKey: indexKeys.join(':'),
        indexValue: indexValue.join(':'),
        limit: many ? undefined : 1,
        filter: target.filter ? (item: any) => target.filter!(ctx.proxy, item) : undefined,
      }))
    }
  }
  return many ? result : result[0] ?? null
}

/**
 * Resolve a partial item to a cached wrapped item when possible.
 */
function tryResolveItemFromCache<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  partialItem: any,
  relation: any,
) {
  if (!partialItem || typeof partialItem !== 'object' || !ctx.options.store)
    return null
  for (const target of relation.to) {
    const targetCollection = ctx.options.store.$collections.find((m: any) => m.name === target.collection)
    if (!targetCollection)
      continue
    try {
      const key = (targetCollection as any).getKey(partialItem)
      if (isKeyDefined(key)) {
        const cached = ctx.options.store.$cache.readItem({ collection: targetCollection as any, key })
        if (cached)
          return cached
      }
    }
    catch {}
  }
  return null
}

/**
 * Apply optimized form operations on top of cache-resolved many relation items.
 */
function applyFormOpsToManyRelation<TData extends Record<string, any>, TSchema extends StandardSchemaV1, TResult extends TData | void>(
  ctx: FormObjectRuntime<TData, TSchema, TResult>,
  fieldKey: string,
  relation: any,
  cacheItems: any[],
) {
  const result = [...cacheItems]
  const fieldOps = optimizeOpLog(
    ctx.opLog.filter(op => op.field === fieldKey && !ctx.relationPayloadSetOps.has(op)) as FormOperation<TData>[],
    ctx.options.collection,
  )
  for (const op of fieldOps) {
    if (op.type === 'set') {
      result.length = 0
      for (const item of Array.isArray(op.newValue) ? op.newValue : [op.newValue]) {
        result.push(tryResolveItemFromCache(ctx, item, relation) ?? item)
      }
    }
    else if (op.type === 'connect') {
      result.push(tryResolveItemFromCache(ctx, op.newValue, relation) ?? op.newValue)
    }
    else if (op.oldValue && typeof op.oldValue === 'object' && !Array.isArray(op.oldValue)) {
      const idx = result.findIndex((item: any) => itemsMatch(item, op.oldValue))
      if (idx !== -1)
        result.splice(idx, 1)
    }
    else {
      result.length = 0
    }
  }
  return result
}
