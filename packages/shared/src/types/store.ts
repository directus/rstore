import type { Hooks } from '../utils/hooks'
import type { Cache } from './cache'
import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionList, StoreSchema } from './collection'
import type { CustomHookMeta } from './hooks'
import type { ResolvedModule } from './module'
import type { MutationOperation, MutationSpecialProps } from './mutation'
import type { RegisteredPlugin } from './plugin'
import type { FetchPolicy, FindOptions, QueryFetchOptions, QueryResultMode } from './query'

/**
 * Interface for the batch scheduler attached to a store.
 *
 * Each `enqueue*` accepts an optional `group` name. Operations sharing the same
 * group are flushed together; different groups have independent queues + timers.
 */
export interface BatchScheduler {
  /** Enqueue a findFirst-by-key operation into the batch */
  enqueueFetchFirst: (collection: ResolvedCollection, key: string | number, findOptions: FindOptions<any, any, any>, meta: CustomHookMeta, group?: string) => Promise<any>
  /** Enqueue a create mutation into the batch */
  enqueueCreate: (collection: ResolvedCollection, item: any, meta: CustomHookMeta, group?: string) => Promise<any>
  /** Enqueue an update mutation into the batch */
  enqueueUpdate: (collection: ResolvedCollection, key: string | number, item: any, meta: CustomHookMeta, group?: string) => Promise<any>
  /** Enqueue a delete mutation into the batch */
  enqueueDelete: (collection: ResolvedCollection, key: string | number, meta: CustomHookMeta, group?: string) => Promise<void>
  /** The resolved batching configuration */
  options: {
    fetch: boolean
    mutations: boolean
    delay: number
    maxWait: number | undefined
    maxSize: number
  }
}

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
  /**
   * @private
   */
  $resolveFindOptions: (collection: ResolvedCollection, options: Partial<FindOptions<any, any, any>>, many: boolean, meta: CustomHookMeta) => FindOptions<any, any, any> & {
    fetchPolicy: FetchPolicy
    fetchOptions: QueryFetchOptions
    resultMode: QueryResultMode
  }
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
   * Batch scheduler instance. Present when batching is enabled.
   * @private
   */
  $batch?: BatchScheduler

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
