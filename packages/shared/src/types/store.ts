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
  /**
   * Synchronize the store offline storage with remote.
   */
  $sync: () => Promise<void>
  /**
   * The state of synchronization of the store.
   */
  $syncState: {
    /**
     * Whether the store is currently syncing.
     */
    isSyncing: boolean
    /**
     * Progress percentage of the sync operation (0-1).
     */
    progress?: number
    /**
     * Optional progress message.
     */
    progressMessage?: string
    /**
     * Date of the last successful sync operation.
     */
    lastSyncAt?: Date
    /**
     * Error encountered during the last sync operation.
     */
    error?: Error
    /**
     * Collection that are ready to be used from local storage.
     */
    loadedCollections: Set<string>
    /**
     * Collections that have been successfully synced with remote.
     */
    syncedCollections: Set<string>
  }
}
