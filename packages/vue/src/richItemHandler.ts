import type { Cache, ResolvedCollection } from '@rstore/shared'
import type { Ref } from 'vue'
import type { VueCachePrivate } from './cache'
import type { WrappedItemMetadata } from './itemMetadata'
import type { VueStore } from './store'
import { isKeyDefined } from '@rstore/core'
import { cloneInfo } from '@rstore/shared'
import { markRaw, toRaw } from 'vue'
import { createItemRelationReader } from './itemRelations'

/** Inputs used to create one rich wrapped-item proxy handler. */
export interface RichItemHandlerOptions {
  /** Owning Vue store. */
  store: VueStore
  /** Resolved collection owning raw values. */
  collection: ResolvedCollection<any, any, any>
  /** Hot-swappable item source. */
  item: Ref<any>
  /** Stable wrapper metadata. */
  metadata: WrappedItemMetadata
}

/** Build prototype-backed traps for computed or relation-rich wrappers. */
export function createRichItemHandler(options: RichItemHandlerOptions): RichItemHandler {
  return new RichItemHandler(options.store, options.collection, options.item, options.metadata)
}

/** Shared proxy traps for wrappers with computed fields or relations. */
export class RichItemHandler implements ProxyHandler<any> {
  /** Attached wrapper used by computed and relation readers. */
  private proxy: any
  /** Lazily resolved target collections by name. */
  private relatedCollections?: Map<string, ResolvedCollection<any, any, any>>
  /** Lazily created relation readers by property key. */
  private relationReaders?: Map<PropertyKey, (current: any) => any>

  /** Create one compact rich handler instance. */
  constructor(
    private readonly store: VueStore,
    private readonly collection: ResolvedCollection<any, any, any>,
    private readonly item: Ref<any>,
    private readonly metadata: WrappedItemMetadata,
  ) {}

  /** Attach proxy identity after handler construction. */
  attach(proxy: any): void {
    this.proxy = proxy
  }

  /** Resolve fields, relations, computed properties, and public helpers. */
  get(_target: any, key: PropertyKey): any {
    const current = this.item.value
    switch (key) {
      case '$collection':
        return this.collection.name
      case '$getKey':
        return () => this.requireItemKey('Key is undefined on item')
      case '$updateForm':
        return async (options?: any) => {
          const key = this.requireItemKey('Key is required on item to update')
          const form = await this.getApi().updateForm({ key }, { defaultValues: options?.defaultValues })
          if (options?.schema)
            form.$schema = markRaw(options.schema)
          return form
        }
      case '$update':
        return (data: any, options?: any) => this.getApi().update(data, {
          ...options,
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
    }

    if (key in this.collection.computed)
      return this.collection.computed[key as string]!(this.proxy)
    if (!Object.isFrozen(current) && key in this.collection.normalizedRelations) {
      if (Reflect.has(current, key))
        return Reflect.get(current, key)
      return this.getRelationReader(key)(current)
    }
    return current[key]
  }

  /** Reject direct wrapped-item assignment. */
  set(): never {
    throw new Error('Items are read-only. Use `item.$updateForm()` to update the item.')
  }

  /** Return raw and virtual enumerable keys. */
  ownKeys(): ArrayLike<string | symbol> {
    return cloneInfo.cloning
      ? Reflect.ownKeys(this.item.value)
      : Array.from(new Set([
          ...Reflect.ownKeys(this.item.value),
          ...Object.keys(this.collection.computed),
          ...Object.keys(this.collection.relations),
        ]))
  }

  /** Check current raw and virtual item fields. */
  has(_target: any, key: PropertyKey): boolean {
    return Reflect.has(this.item.value, key) || (
      !cloneInfo.cloning && (key in this.collection.computed || key in this.collection.relations)
    )
  }

  /** Expose configurable raw or virtual descriptors. */
  getOwnPropertyDescriptor(_target: any, key: PropertyKey): PropertyDescriptor | undefined {
    if (!cloneInfo.cloning && (key in this.collection.computed || key in this.collection.relations)) {
      return { enumerable: true, configurable: true }
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(this.item.value, key)
    return descriptor ? { ...descriptor, configurable: true } : undefined
  }

  /** Forward safe explicit property definition to current raw item. */
  defineProperty(_target: any, property: PropertyKey, attributes: PropertyDescriptor): boolean {
    if (property in this.collection.computed || property in this.collection.relations)
      throw new Error(`Cannot define property ${String(property)} because it is a computed property or a relation`)
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

  /** Resolve and cache one relation target collection. */
  private getRelatedCollection(name: string): ResolvedCollection<any, any, any> {
    this.relatedCollections ??= new Map()
    let collection = this.relatedCollections.get(name)
    if (!collection) {
      collection = this.store.$collections.find(candidate => candidate.name === name)
      if (!collection)
        throw new Error(`Collection "${name}" does not exist in the store`)
      this.relatedCollections.set(name, collection)
    }
    return collection
  }

  /** Create one relation reader only after its first field access. */
  private getRelationReader(key: PropertyKey): (current: any) => any {
    this.relationReaders ??= new Map()
    let reader = this.relationReaders.get(key)
    if (!reader) {
      const relation = this.collection.normalizedRelations[key as string]!
      reader = createItemRelationReader({
        cache: this.store.$cache as Cache & VueCachePrivate,
        collection: this.collection,
        proxy: this.proxy,
        relation,
        getCollection: name => this.getRelatedCollection(name),
      })
      this.relationReaders.set(key, reader)
    }
    return reader
  }
}
