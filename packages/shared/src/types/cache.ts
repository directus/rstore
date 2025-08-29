import type { WrappedItem } from './item'
import type { Model, ModelDefaults, ModelRelation, ResolvedModel, ResolvedModelItemBase, StoreSchema } from './model'
import type { Module, ResolvedModuleState } from './module'

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
  TSchema extends StoreSchema = StoreSchema,
> {
  key: string | number
  value: ResolvedModelItemBase<TModel, TModelDefaults, TSchema>
}

export interface Cache<
  TSchema extends StoreSchema = StoreSchema,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  readItem: <TModel extends Model = Model>(params: {
    model: ResolvedModel<TModel, TModelDefaults, TSchema>
    key: string | number
  }) => WrappedItem<TModel, TModelDefaults, TSchema> | undefined

  writeItem: <TModel extends Model = Model>(params: {
    model: ResolvedModel<TModel, TModelDefaults, TSchema>
    key: string | number
    item: ResolvedModelItemBase<TModel, TModelDefaults, TSchema>
    marker?: string
    fromWriteItems?: boolean
  }) => void

  deleteItem: <TModel extends Model = Model>(params: {
    model: ResolvedModel<TModel, TModelDefaults, TSchema>
    key: string | number
  }) => void

  readItems: <TModel extends Model = Model>(params: {
    model: ResolvedModel<TModel, TModelDefaults, TSchema>
    /**
     * Marker to consider that the corresponding list was already fetched once. Allow returning empty list if marker is not found.
     */
    marker?: string
    /**
     * Filter the items to include.
     */
    filter?: (item: WrappedItem<TModel, TModelDefaults, TSchema>) => boolean
    /**
     * Limit the number of items returned.
     */
    limit?: number
  }) => Array<WrappedItem<TModel, TModelDefaults, TSchema>>

  writeItems: <TModel extends Model = Model>(params: {
    model: ResolvedModel<TModel, TModelDefaults, TSchema>
    items: Array<WriteItem<TModel, TModelDefaults, TSchema>>
    /**
     * Marker to consider that the corresponding list was already fetched once.
     */
    marker: string
  }) => void

  writeItemForRelation: <TModel extends Model = Model>(params: {
    parentModel: ResolvedModel<TModel, TModelDefaults, TSchema>
    relationKey: keyof ResolvedModelItemBase<TModel, TModelDefaults, TSchema>['relations']
    relation: ModelRelation
    childItem: any
  }) => void

  getModuleState: <TModule extends Module> (name: TModule['name'], initState: TModule['state']) => ResolvedModuleState<TModule>

  getState: () => CustomCacheState

  setState: (state: CustomCacheState) => void

  clear: () => void

  clearModel: (params: {
    model: ResolvedModel<Model, ModelDefaults, StoreSchema>
  }) => void
}
