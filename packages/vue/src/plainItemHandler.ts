import type { Ref } from 'vue'
import type { VueCollectionApi } from './api'
import type { WrappedItemMetadata } from './item'
import { isKeyDefined } from '@rstore/core'
import { markRaw, toRaw } from 'vue'

/** Inputs shared by one schema-plain wrapped-item proxy handler. */
export interface PlainItemHandlerOptions {
  /** Resolved collection owning raw values. */
  collection: any
  /** Hot-swappable item source. */
  item: Ref<any>
  /** Stable wrapper metadata. */
  metadata: WrappedItemMetadata<any, any, any>
  /** Resolve collection mutation API lazily. */
  getApi: () => VueCollectionApi<any, any, any, any>
}

/** Build proxy traps without computed, relation, or frozen field branches. */
export function createPlainItemHandler(options: PlainItemHandlerOptions): ProxyHandler<any> {
  const { collection, item, metadata, getApi } = options
  return {
    get: (_target, key) => {
      const current = item.value
      switch (key) {
        case '$collection':
          return collection.name
        case '$getKey':
          return () => requireItemKey(collection, item.value, 'Key is undefined on item')
        case '$updateForm':
          return async (formOptions?: any) => {
            const key = requireItemKey(collection, item.value, 'Key is required on item to update')
            const form = await getApi().updateForm({ key }, { defaultValues: formOptions?.defaultValues })
            if (formOptions?.schema)
              form.$schema = markRaw(formOptions.schema)
            return form
          }
        case '$update':
          return (data: any, updateOptions?: any) => getApi().update(data, {
            ...updateOptions,
            key: collection.getKey(item.value),
          })
        case '$delete':
          return () => getApi().delete(requireItemKey(collection, item.value, 'Key is required on item to delete'))
        case '$isOptimistic':
          return current.$layer?.optimistic ?? false
        case '$meta':
          return metadata
        case '$raw':
          return () => toRaw(current)
        case 'toJSON':
          return () => current
        default:
          return Reflect.get(current, key)
      }
    },
    set: readonlyError,
    ownKeys: () => Reflect.ownKeys(item.value),
    has: (_target, key) => Reflect.has(item.value, key),
    getOwnPropertyDescriptor: (_target, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(item.value, key)
      return descriptor ? { ...descriptor, configurable: true } : undefined
    },
    defineProperty: (_target, property, attributes) => Reflect.defineProperty(item.value, property, attributes),
    deleteProperty: readonlyDeleteError,
  }
}

/** Resolve and validate one live wrapper key for mutation helpers. */
function requireItemKey(collection: any, value: any, message: string): string | number {
  const key = collection.getKey(value)
  if (!isKeyDefined(key))
    throw new Error(message)
  return key
}

/** Reject direct wrapped-item assignment. */
function readonlyError(): never {
  throw new Error('Items are read-only. Use `item.$updateForm()` to update the item.')
}

/** Reject direct wrapped-item deletion. */
function readonlyDeleteError(): never {
  throw new Error('Items are read-only. Use `item.$delete()` to delete the item.')
}
