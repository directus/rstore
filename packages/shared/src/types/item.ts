import type { Model, ModelDefaults, ModelType, ResolvedModelItem } from './model'

/**
 * Tracked object. The object is tracked by the store and can be used to update the data.
 */
export type TrackedItem<
  TModelType extends ModelType,
  TModelDefaults extends ModelDefaults,
  TModel extends Model,
> = ResolvedModelItem<TModelType, TModelDefaults, TModel> & {
  /**
   * Name of the model.
   */
  $type: TModelType['name']
  // @TODO
  // $save: () => Promise<void>
}
