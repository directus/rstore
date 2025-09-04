import type { Hooks } from '../utils/hooks'
import type { Cache } from './cache'
import type { Model, ModelDefaults, ResolvedModel, ResolvedModelList, StoreSchema } from './model'
import type { ResolvedModule } from './module'
import type { MutationOperation, MutationSpecialProps } from './mutation'
import type { RegisteredPlugin } from './plugin'
import type { FetchPolicy, FindOptions } from './query'

export interface StoreCore<
  TSchema extends StoreSchema,
  TModelDefaults extends ModelDefaults = ModelDefaults,
> {
  $cache: Cache<TSchema, TModelDefaults>
  $models: ResolvedModelList<TSchema, TModelDefaults>
  $modelDefaults: TModelDefaults
  $plugins: Array<RegisteredPlugin>
  $hooks: Hooks<TSchema, TModelDefaults>
  $findDefaults: Partial<FindOptions<any, any, any>>
  $getFetchPolicy: (value: FetchPolicy | null | undefined) => FetchPolicy
  /**
   * @private
   */
  $processItemParsing: <TModel extends Model> (model: ResolvedModel<TModel, TModelDefaults, TSchema>, item: any) => void
  /**
   * @private
   */
  $processItemSerialization: <TModel extends Model> (model: ResolvedModel<TModel, TModelDefaults, TSchema>, item: any) => void
  $getModel: (item: any, modelNames?: string[]) => ResolvedModel<Model, ModelDefaults, StoreSchema> | null
  $mutationHistory: Array<MutationOperation<any, TModelDefaults, TSchema>>
  $isServer: boolean
  /**
   * @private
   */
  $dedupePromises: Map<string, Promise<any>>
  /**
   * @private
   */
  $registeredModules: Map<string, ResolvedModule<any, any>>
  /**
   * @private
   */
  $wrapMutation: <TMutation> (mutation: TMutation) => TMutation & MutationSpecialProps
}
