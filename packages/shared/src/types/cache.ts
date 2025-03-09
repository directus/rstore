import type { WrappedItem } from './item'
import type { Model, ModelDefaults, ModelMap, ModelRelation, ResolvedModel, ResolvedModelItemBase } from './model'

/*

Markers are used to track if a query (usually with a filter) was already fetched once.
This is useful to return an empty list from the cache if the list was never actually fetched despite part of it potentially being in the cache -
which is a nice default for most apps.
The markers can be overwritten by plugins using the `payload.setMarker` method.

Example:

1. Fetch a single user with id 1
2. Go to all users page
3. Peek the cache for users

If there wasn't a marker, the cache would return a list with the single user that was specifically fetched in step 1.

4. See that there is no marker for this list (by default taking into account: model.name, params object, filter object) => return empty list
5. Cache miss => fetch all users

*/

export interface CustomCacheState {}

export interface WriteItem<
  TModel extends Model = Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
  TModelMap extends ModelMap = ModelMap,
> {
  key: string
  value: ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>
}

export interface Cache<
  TModelMap extends ModelMap = ModelMap,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  readItem: <TModel extends Model = Model>(params: {
    model: ResolvedModel<TModel, TModelDefaults, TModelMap>
    key: string
  }) => WrappedItem<TModel, TModelDefaults, TModelMap> | undefined

  writeItem: <TModel extends Model = Model>(params: {
    model: ResolvedModel<TModel, TModelDefaults, TModelMap>
    key: string
    item: ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>
    marker?: string
    fromWriteItems?: boolean
  }) => void

  deleteItem: <TModel extends Model = Model>(params: {
    model: ResolvedModel<TModel, TModelDefaults, TModelMap>
    key: string
  }) => void

  readItems: <TModel extends Model = Model>(params: {
    model: ResolvedModel<TModel, TModelDefaults, TModelMap>
    /**
     * Marker to consider that the corresponding list was already fetched once. Allow returning empty list if marker is not found.
     */
    marker?: string
  }) => Array<WrappedItem<TModel, TModelDefaults, TModelMap>>

  writeItems: <TModel extends Model = Model>(params: {
    model: ResolvedModel<TModel, TModelDefaults, TModelMap>
    items: Array<WriteItem<TModel, TModelDefaults, TModelMap>>
    /**
     * Marker to consider that the corresponding list was already fetched once.
     */
    marker: string
  }) => void

  writeItemForRelation: <TModel extends Model = Model>(params: {
    model: ResolvedModel<TModel, TModelDefaults, TModelMap>
    relationKey: keyof ResolvedModelItemBase<TModel, TModelDefaults, TModelMap>['relations']
    relation: ModelRelation
    item: any
  }) => void

  getState: () => CustomCacheState

  setState: (state: CustomCacheState) => void

  clear: () => void
}
