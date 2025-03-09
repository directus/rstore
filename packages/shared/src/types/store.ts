import type { Hooks } from '../utils/hooks'
import type { Cache } from './cache'
import type { Model, ModelDefaults, ModelMap, ResolvedModel, ResolvedModelMap } from './model'
import type { MutationOperation } from './mutation'
import type { Plugin } from './plugin'
import type { FetchPolicy, FindOptions } from './query'

export interface StoreCore<
  TModelMap extends ModelMap,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  cache: Cache<TModelMap, TModelDefaults>
  models: ResolvedModelMap<TModelMap, TModelDefaults>
  modelDefaults: TModelDefaults
  plugins: Array<Plugin>
  hooks: Hooks<TModelMap, TModelDefaults>
  findDefaults: Partial<FindOptions<any, any, any>>
  getFetchPolicy: (value: FetchPolicy | null | undefined) => FetchPolicy
  processItemParsing: <TModel extends Model> (model: ResolvedModel<TModel, TModelDefaults, TModelMap>, item: any) => void
  getModel: (item: any, types?: string[]) => ResolvedModel<Model, ModelDefaults, ModelMap> | null
  mutationHistory: Array<MutationOperation<any, TModelDefaults, TModelMap>>
}
