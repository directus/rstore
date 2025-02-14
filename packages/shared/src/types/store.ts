import type { Hooks } from '../utils/hooks'
import type { Cache } from './cache'
import type { Model, ModelDefaults, ResolvedModel } from './model'
import type { Plugin } from './plugin'
import type { FetchPolicy, FindOptions, QueryApi } from './query'

export interface Store<
  TModel extends Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  cache: Cache<TModel, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults>
  modelDefaults: TModelDefaults
  plugins: Array<Plugin>
  hooks: Hooks<TModel, TModelDefaults>
  query: {
    [TKey in keyof TModel]: QueryApi<TModel[TKey], TModelDefaults, TModel>
  }
  findDefaults: Partial<FindOptions<any, any, any>>
  getFetchPolicy: (value: FetchPolicy | null | undefined) => FetchPolicy
}
