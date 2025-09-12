import type { Hooks } from '../utils/hooks'
import type { Cache } from './cache'
import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionList, StoreSchema } from './collection'
import type { ResolvedModule } from './module'
import type { MutationOperation, MutationSpecialProps } from './mutation'
import type { RegisteredPlugin } from './plugin'
import type { FetchPolicy, FindOptions } from './query'

export interface StoreCore<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
> {
  $cache: Cache<TSchema, TCollectionDefaults>
  $collections: ResolvedCollectionList<TSchema, TCollectionDefaults>
  $collectionDefaults: TCollectionDefaults
  $plugins: Array<RegisteredPlugin>
  $hooks: Hooks<TSchema, TCollectionDefaults>
  $findDefaults: Partial<FindOptions<any, any, any>>
  $getFetchPolicy: (value: FetchPolicy | null | undefined) => FetchPolicy
  /**
   * @private
   */
  $processItemParsing: <TCollection extends Collection> (collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>, item: any) => void
  /**
   * @private
   */
  $processItemSerialization: <TCollection extends Collection> (collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>, item: any) => void
  $getCollection: (item: any, collectionNames?: string[]) => ResolvedCollection<Collection, CollectionDefaults, StoreSchema> | null
  $mutationHistory: Array<MutationOperation<any, TCollectionDefaults, TSchema>>
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
