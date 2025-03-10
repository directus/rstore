import type { Hooks } from '../utils/hooks'
import type { Cache } from './cache'
import type { Model, ModelDefaults, ModelList, ResolvedModel, ResolvedModelList } from './model'
import type { MutationOperation } from './mutation'
import type { Plugin } from './plugin'
import type { FetchPolicy, FindOptions } from './query'

export interface StoreCore<
  TModelList extends Array<Model>,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  cache: Cache<TModelList, TModelDefaults>
  models: ResolvedModelList<TModelList, TModelDefaults>
  modelDefaults: TModelDefaults
  plugins: Array<Plugin>
  hooks: Hooks<TModelList, TModelDefaults>
  findDefaults: Partial<FindOptions<any, any, any>>
  getFetchPolicy: (value: FetchPolicy | null | undefined) => FetchPolicy
  processItemParsing: <TModel extends Model> (model: ResolvedModel<TModel, TModelDefaults, TModelList>, item: any) => void
  getModel: (item: any, modelNames?: string[]) => ResolvedModel<Model, ModelDefaults, ModelList> | null
  mutationHistory: Array<MutationOperation<any, TModelDefaults, TModelList>>
}
