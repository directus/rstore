import type { CacheLayer } from './layer'
import type { Model, ModelDefaults, ResolvedModelItem, StoreSchema } from './model'
import type { UpdateFormObject } from './mutation'

/**
 * The object is wrapped by the store with additional props and can be used to update the data.
 */
export interface WrappedItemBase<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> {
  /**
   * Name of the model.
   */
  $model: TModel['name']

  /**
   * (Recommended) The form object helps you updating the item.
   */
  $updateForm: (options?: WrappedItemUpdateFormOptions<TModel, TModelDefaults, TSchema>) => Promise<UpdateFormObject<TModel, TModelDefaults, TSchema>>

  /**
   * Update an item directly. For a more user-friendly way, use `updateForm` instead.
   */
  $update: (data: Partial<ResolvedModelItem<TModel, TModelDefaults, TSchema>>) => Promise<ResolvedModelItem<TModel, TModelDefaults, TSchema>>

  /**
   * Delete the item.
   */
  $delete: () => Promise<void>

  $getKey: () => string

  $isOptimistic: boolean

  $layer?: CacheLayer | undefined
}

/**
 * The object is wrapped by the store with additional props and can be used to update the data.
 */
export type WrappedItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TSchema extends StoreSchema,
> = WrappedItemBase<TModel, TModelDefaults, TSchema> & ResolvedModelItem<TModel, TModelDefaults, TSchema>

/* eslint-disable unused-imports/no-unused-vars */

export interface WrappedItemUpdateFormOptions<
  TModel extends Model = Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
  TSchema extends StoreSchema = StoreSchema,
> {
  // to be extended
}

/* eslint-enable unused-imports/no-unused-vars */
