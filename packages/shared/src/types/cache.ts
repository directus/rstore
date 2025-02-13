import type { Model, ModelDefaults, ModelType, ResolvedModelItem, ResolvedModelType } from './model'
import type { TrackedItem } from './query'

/*

Markers are used to track if a list was already fetched once.
This is useful to return an empty list from the cache if the list was never actually fetched despite part of it potentially being in the cache -
which is a nice default for most apps.
The markers can be overwritten by plugins using the `payload.setMarker` method.

Example:

1. Fetch a single user with id 1
2. Go to all users page
3. Peek the cache for users

If there wasn't a marker, the cache would return a list with the single user that was specifically fetched in step 1.

4. See that there is no marker for this list (by default taking into account: type.name, params object, filter object) => return empty list
5. Cache miss => fetch all users

*/

export interface CustomCacheState {}

export interface WriteItem<
  TModelType extends ModelType = ModelType,
  TModelDefaults extends ModelDefaults = ModelDefaults,
  TModel extends Model = Model,
> {
  key: string
  value: ResolvedModelItem<TModelType, TModelDefaults, TModel>
}

export interface Cache<
  TModel extends Model = Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  readItem: <TModelType extends ModelType = ModelType>(type: ResolvedModelType<TModelType, TModelDefaults>, key: string) => TrackedItem<TModelType, TModelDefaults, TModel> | undefined

  /**
   * Read items from the cache
   * @param type
   * @param marker Marker to consider that the corresponding list was already fetched once. Allow returning empty list if marker is not found.
   * @returns
   */
  readItems: <TModelType extends ModelType = ModelType>(type: ResolvedModelType<TModelType, TModelDefaults>, marker: string) => Array<TrackedItem<TModelType, TModelDefaults, TModel>>

  writeItem: <TModelType extends ModelType = ModelType>(type: ResolvedModelType<TModelType, TModelDefaults>, key: string, item: ResolvedModelItem<TModelType, TModelDefaults, TModel>) => void

  /**
   * Write items list to the cache
   * @param type
   * @param items
   * @param marker Marker to consider that the corresponding list was already fetched once.
   * @returns
   */
  writeItems: <TModelType extends ModelType = ModelType>(type: ResolvedModelType<TModelType, TModelDefaults>, items: Array<WriteItem<TModelType, TModelDefaults, TModel>>, marker: string) => void

  getState: () => CustomCacheState

  setState: (state: CustomCacheState) => void

  clear: () => void
}
