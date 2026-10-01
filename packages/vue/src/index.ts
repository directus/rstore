import './types'

export type {
  LiveQueryBuilder,
  LiveQueryResult,
  QueryBuilder,
  QueryFirstOptions,
  QueryManyOptions,
  QueryResult,
  QueryType,
  SubscribeResult,
  SubscriptionQueryBuilder,
  VueCollectionApi,
} from './api'

export {
  cacheWriteEventHook,
  realtimeReconnectEventHook,
} from './events'

export {
  createFormObject,
  createFormObjectWithChangeDetection,
  optimizeOpLog,
} from './form'

export type {
  VueCreateFormObject as CreateFormObject,
  CreateFormObjectOptions,
  FormObjectAdditionalProps,
  FormObjectChanged,
  FormOperation,
  FormOperationType,
  OpLogAPI,
  OpLogFilterFn,
  VueUpdateFormObject as UpdateFormObject,
  VueFormObject,
} from './form'

export {
  defineModule,
} from './module'

export {
  definePlugin,
  injectionKey,
  install as RstorePlugin,
  useStore,
} from './plugin'

export type {
  PluginOptions,
  VuePlugin,
  VuePluginSetupApi,
} from './plugin'

export type {
  VueQueryFetchState,
  VueQueryPage,
  VueQueryPageFetchState,
  VueQueryPageOptions,
  VueQueryPages,
  VueQueryRawData,
  VueQueryRefreshOptions,
  VueQueryReturn,
} from './query'

export {
  addCollection,
  addCollections,
  createStore,
  removeCollection,
  setActiveStore,
} from './store'

export type {
  CreateStoreOptions,
  VueStore,
  VueStoreCollectionApiProxy,
} from './store'

export {
  useQueryTracking,
} from './tracking'

export type {
  UseQueryTrackingOptions,
} from './tracking'

export type {
  QueryTrackingController,
} from './trackingOwnership'

export {
  addCollectionRelations,
  defineCollection,
  defineRelations,
  withItemType,
} from '@rstore/core'

export type {
  CacheLayer,
  Collection,
  CollectionByName,
  CollectionDefaults,
  CollectionNameMap,
  CollectionRelation,
  CollectionRelationReference,
  CustomCacheState,
  CustomCollectionMeta,
  CustomFilterOption,
  CustomHookMeta,
  CustomIncludeOption,
  CustomParams,
  CustomPluginMeta,
  CustomSortOption,
  FindFirstOptions,
  FindManyOptions,
  FindOptions,
  FindOptionsBase,
  Hooks,
  HybridPromise,
  Module,
  NormalizedRelation,
  ResolvedCollection,
  ResolvedCollectionItem,
  ResolvedCollectionItemBase,
  StandardSchemaV1,
  StoreCore,
  StoreSchema,
  WrappedItem,
} from '@rstore/shared'
