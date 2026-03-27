import './types'

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
  FormOperation,
  FormOperationType,
  VueUpdateFormObject as UpdateFormObject,
} from './form'

export {
  defineModule,
} from './module'

export {
  injectionKey,
  install as RstorePlugin,
  useStore,
} from './plugin'

export {
  addCollection,
  createStore,
  removeCollection,
  setActiveStore,
} from './store'

export type {
  CreateStoreOptions,
  VueStore,
} from './store'

export {
  useQueryTracking,
} from './tracking'

export type {
  UseQueryTrackingOptions,
} from './tracking'

export {
  addCollectionRelations,
  defineCollection,
  definePlugin,
  defineRelations,
  withItemType,
} from '@rstore/core'

export type {
  Collection,
  CollectionDefaults,
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
  Module,
  StoreSchema,
} from '@rstore/shared'
