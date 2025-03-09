import type { Model, ModelDefaults, ModelMap, ResolvedModelItem } from './model'
import type { UpdateFormObject } from './mutation'

/**
 * The object is wrapped by the store with additional props and can be used to update the data.
 */
export interface WrappedItemBase<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> {
  /**
   * Name of the model.
   */
  $model: TModel['name']

  /**
   * (Recommended) The form object helps you updating the item.
   */
  $updateForm: (options?: WrappedItemUpdateFormOptions<TModel, TModelDefaults, TModelMap>) => Promise<UpdateFormObject<TModel, TModelDefaults, TModelMap>>

  /**
   * Update an item directly. For a more user-friendly way, use `updateForm` instead.
   */
  $update: (data: Partial<ResolvedModelItem<TModel, TModelDefaults, TModelMap>>) => Promise<void>

  /**
   * Delete the item.
   */
  $delete: () => Promise<void>
}

/**
 * The object is wrapped by the store with additional props and can be used to update the data.
 */
export type WrappedItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelMap extends ModelMap,
> = WrappedItemBase<TModel, TModelDefaults, TModelMap> & ResolvedModelItem<TModel, TModelDefaults, TModelMap>

/* eslint-disable unused-imports/no-unused-vars */

export interface WrappedItemUpdateFormOptions<
  TModel extends Model = Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
  TModelMap extends ModelMap = ModelMap,
> {
  // to be extended
}

/* eslint-enable unused-imports/no-unused-vars */
