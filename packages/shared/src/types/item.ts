import type { Collection, CollectionDefaults, ResolvedCollectionItem, StoreSchema } from './collection'
import type { CacheLayer } from './layer'
import type { UpdateFormObject } from './mutation'

/**
 * The object is wrapped by the store with additional props and can be used to update the data.
 */
export interface WrappedItemBase<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> {
  /**
   * Name of the collection.
   */
  $collection: TCollection['name']

  /**
   * (Recommended) The form object helps you updating the item.
   */
  $updateForm: (options?: WrappedItemUpdateFormOptions<TCollection, TCollectionDefaults, TSchema>) => Promise<UpdateFormObject<TCollection, TCollectionDefaults, TSchema>>

  /**
   * Update an item directly. For a more user-friendly way, use `updateForm` instead.
   */
  $update: (data: Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>, options?: WrappedItemUpdateOptions<TCollection, TCollectionDefaults, TSchema>) => Promise<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>

  /**
   * Delete the item.
   */
  $delete: () => Promise<void>

  $getKey: () => string

  $isOptimistic: boolean

  $layer?: CacheLayer | undefined

  $overrideKey?: string | number
}

/**
 * The object is wrapped by the store with additional props and can be used to update the data.
 */
export type WrappedItem<
  TCollection extends Collection,
  TCollectionDefaults extends CollectionDefaults,
  TSchema extends StoreSchema,
> = WrappedItemBase<TCollection, TCollectionDefaults, TSchema> & ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>

/* eslint-disable unused-imports/no-unused-vars */

export interface WrappedItemUpdateFormOptions<
  TCollection extends Collection = Collection,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
> {
  // to be extended
}

export interface WrappedItemUpdateOptions<
  TCollection extends Collection = Collection,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
  TSchema extends StoreSchema = StoreSchema,
> {
  // to be extended
}

/* eslint-enable unused-imports/no-unused-vars */
