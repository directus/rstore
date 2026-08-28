import type { Ref } from 'vue'
import type { WrappedItemMetadata } from './itemMetadata'
import type { VueStore } from './store'
import { isKeyDefined } from '@rstore/core'
import { markRaw, toRaw } from 'vue'

/** Inputs used to create one plain wrapped-item proxy handler. */
export interface PlainItemHandlerOptions {
  /** Resolved collection owning raw values. */
  collection: any
  /** Hot-swappable item source. */
  item: Ref<any>
  /** Stable wrapper metadata. */
  metadata: WrappedItemMetadata
  /** Owning Vue store. */
  store: VueStore
}

/** Build a prototype-backed handler for schema-plain item wrappers. */
export function createPlainItemHandler(options: PlainItemHandlerOptions): ProxyHandler<any> {
  return new PlainItemHandler(options.collection, options.item, options.metadata, options.store)
}

/** Shared proxy traps for wrappers without computed fields or relations. */
class PlainItemHandler implements ProxyHandler<any> {
  /** Create one compact handler instance. */
  constructor(
    private readonly collection: any,
    private readonly item: Ref<any>,
    private readonly metadata: WrappedItemMetadata,
    private readonly store: VueStore,
  ) {}

  /** Resolve fields and public wrapper helpers from current raw state. */
  get(_target: any, key: PropertyKey): any {
    const current = this.item.value
    switch (key) {
      case '$collection':
        return this.collection.name
      case '$getKey':
        return () => this.requireItemKey('Key is undefined on item')
      case '$updateForm':
        return async (formOptions?: any) => {
          const key = this.requireItemKey('Key is required on item to update')
          const form = await this.getApi().updateForm({ key }, { defaultValues: formOptions?.defaultValues })
          if (formOptions?.schema)
            form.$schema = markRaw(formOptions.schema)
          return form
        }
      case '$update':
        return (data: any, updateOptions?: any) => this.getApi().update(data, {
          ...updateOptions,
          key: this.collection.getKey(this.item.value),
        })
      case '$delete':
        return () => this.getApi().delete(this.requireItemKey('Key is required on item to delete'))
      case '$isOptimistic':
        return current.$layer?.optimistic ?? false
      case '$meta':
        return this.metadata
      case '$raw':
        return () => toRaw(current)
      case 'toJSON':
        return () => current
      default:
        return current[key]
    }
  }

  /** Reject direct wrapped-item assignment. */
  set(): never {
    throw new Error('Items are read-only. Use `item.$updateForm()` to update the item.')
  }

  /** Return enumerable keys from current raw value. */
  ownKeys(): ArrayLike<string | symbol> {
    return Reflect.ownKeys(this.item.value)
  }

  /** Check current raw item property ownership. */
  has(_target: any, key: PropertyKey): boolean {
    return Reflect.has(this.item.value, key)
  }

  /** Expose configurable descriptors required by proxy facade invariants. */
  getOwnPropertyDescriptor(_target: any, key: PropertyKey): PropertyDescriptor | undefined {
    const descriptor = Reflect.getOwnPropertyDescriptor(this.item.value, key)
    return descriptor ? { ...descriptor, configurable: true } : undefined
  }

  /** Forward explicit property definition to current raw item. */
  defineProperty(_target: any, property: PropertyKey, attributes: PropertyDescriptor): boolean {
    return Reflect.defineProperty(this.item.value, property, attributes)
  }

  /** Reject direct wrapped-item deletion. */
  deleteProperty(): never {
    throw new Error('Items are read-only. Use `item.$delete()` to delete the item.')
  }

  /** Resolve collection mutation API without wrapper-specific closures. */
  private getApi(): any {
    return this.store[this.collection.name as keyof VueStore]
  }

  /** Resolve and validate current item key. */
  private requireItemKey(message: string): string | number {
    const key = this.collection.getKey(this.item.value)
    if (!isKeyDefined(key))
      throw new Error(message)
    return key
  }
}
