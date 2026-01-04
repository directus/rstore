import './types'

export {
  createFormObject,
  createFormObjectWithChangeDetection,
} from './form'

export type {
  VueCreateFormObject as CreateFormObject,
  VueUpdateFormObject as UpdateFormObject,
} from './form'

export {
  defineModule,
} from './module'

export {
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
  CustomParams,
  CustomPluginMeta,
  CustomSortOption,
  FindFirstOptions,
  FindManyOptions,
  FindOptions,
  Module,
  StoreSchema,
} from '@rstore/shared'
