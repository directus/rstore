import type { Hooks } from '../utils/hooks'
import type { Cache } from './cache'
import type { Model, ModelDefaults, ModelList, ResolvedModel, ResolvedModelList } from './model'
import type { CreateModuleApi, Module, ResolvedModule } from './module'
import type { MutationOperation, MutationSpecialProps } from './mutation'
import type { RegisteredPlugin } from './plugin'
import type { FetchPolicy, FindOptions } from './query'

export interface StoreCore<
  TModelList extends Array<Model>,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  $cache: Cache<TModelList, TModelDefaults>
  $models: ResolvedModelList<TModelList, TModelDefaults>
  $modelDefaults: TModelDefaults
  $plugins: Array<RegisteredPlugin>
  $hooks: Hooks<TModelList, TModelDefaults>
  $findDefaults: Partial<FindOptions<any, any, any>>
  $getFetchPolicy: (value: FetchPolicy | null | undefined) => FetchPolicy
  /**
   * @private
   */
  $processItemParsing: <TModel extends Model> (model: ResolvedModel<TModel, TModelDefaults, TModelList>, item: any) => void
  /**
   * @private
   */
  $processItemSerialization: <TModel extends Model> (model: ResolvedModel<TModel, TModelDefaults, TModelList>, item: any) => void
  $getModel: (item: any, modelNames?: string[]) => ResolvedModel<Model, ModelDefaults, ModelList> | null
  $mutationHistory: Array<MutationOperation<any, TModelDefaults, TModelList>>
  $isServer: boolean
  /**
   * @private
   */
  $dedupePromises: Map<string, Promise<any>>
  /**
   * @deprecated Use `createModule` import instead.
   */
  $createModule: <TModule extends Module> (module: TModule) => CreateModuleApi<TModule>
  /**
   * @private
   */
  $registeredModules: Map<string, ResolvedModule<any, any>>
  /**
   * @private
   */
  $wrapMutation: <TMutation> (mutation: TMutation) => TMutation & MutationSpecialProps
}
