import type { Model, ModelDefaults, ModelList, ResolvedModelItem } from './model'
import type { UpdateFormObject } from './mutation'

/**
 * The object is wrapped by the store with additional props and can be used to update the data.
 */
export interface WrappedItemBase<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> {
  /**
   * Name of the model.
   */
  $model: TModel['name']

  /**
   * (Recommended) The form object helps you updating the item.
   */
  $updateForm: (options?: WrappedItemUpdateFormOptions<TModel, TModelDefaults, TModelList>) => Promise<UpdateFormObject<TModel, TModelDefaults, TModelList>>

  /**
   * Update an item directly. For a more user-friendly way, use `updateForm` instead.
   */
  $update: (data: Partial<ResolvedModelItem<TModel, TModelDefaults, TModelList>>) => Promise<void>

  /**
   * Delete the item.
   */
  $delete: () => Promise<void>

  $getKey: () => string
}

/**
 * The object is wrapped by the store with additional props and can be used to update the data.
 */
export type WrappedItem<
  TModel extends Model,
  TModelDefaults extends ModelDefaults,
  TModelList extends ModelList,
> = WrappedItemBase<TModel, TModelDefaults, TModelList> & ResolvedModelItem<TModel, TModelDefaults, TModelList>

/* eslint-disable unused-imports/no-unused-vars */

export interface WrappedItemUpdateFormOptions<
  TModel extends Model = Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
  TModelList extends ModelList = ModelList,
> {
  // to be extended
}

/* eslint-enable unused-imports/no-unused-vars */
