import type { Hooks } from '../utils/hooks'
import type { Cache } from './cache'
import type { Model, ModelDefaults, ModelType, ResolvedModel, ResolvedModelType } from './model'
import type { MutationOperation } from './mutation'
import type { Plugin } from './plugin'
import type { FetchPolicy, FindOptions } from './query'

export interface StoreCore<
  TModel extends Model,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  cache: Cache<TModel, TModelDefaults>
  model: ResolvedModel<TModel, TModelDefaults>
  modelDefaults: TModelDefaults
  plugins: Array<Plugin>
  hooks: Hooks<TModel, TModelDefaults>
  findDefaults: Partial<FindOptions<any, any, any>>
  getFetchPolicy: (value: FetchPolicy | null | undefined) => FetchPolicy
  processItemParsing: <TModelType extends ModelType> (type: ResolvedModelType<TModelType, TModelDefaults, TModel>, item: any) => void
  getType: (item: any, types?: string[]) => ResolvedModelType<ModelType, ModelDefaults, Model> | null
  mutationHistory: Array<MutationOperation<any, TModelDefaults, TModel>>
}
