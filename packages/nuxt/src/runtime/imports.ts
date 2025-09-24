import type { constCollections } from '#build/$rstore-collection-const'
import type { CollectionByName, CollectionNameMap, ResolvedCollectionItem, WrappedItem } from '@rstore/shared'
import { useNuxtApp } from '#app'
import { type CreateFormObject, defineRelations, type UpdateFormObject, type VueStore, withItemType } from '@rstore/vue'

export * from '@rstore/vue'

export {
  defineModule as defineRstoreModule,
  definePlugin as defineRstorePlugin,
} from '@rstore/vue'

export const RStoreSchema = {
  withItemType,
  defineRelations,
}

export type StoreRawCollections = typeof constCollections

export interface StoreCollectionDefaults {}

export type Store = VueStore<
  StoreRawCollections,
  StoreCollectionDefaults
>

type StoreCollectionNameMap = CollectionNameMap<StoreRawCollections>

export type StoreResolvedCollectionItem<
  TCollectionName extends keyof StoreCollectionNameMap,
> = ResolvedCollectionItem<
  CollectionByName<Store['$collections'], TCollectionName, StoreCollectionNameMap>,
  Store['$collectionDefaults'],
  StoreRawCollections
>

export type StoreWrappedItem<
  TCollectionName extends keyof StoreCollectionNameMap,
> = WrappedItem<
  CollectionByName<Store['$collections'], TCollectionName, StoreCollectionNameMap>,
  Store['$collectionDefaults'],
  StoreRawCollections
>

export type StoreCreateFormObject<
  TCollectionName extends keyof StoreCollectionNameMap,
> = CreateFormObject<
  CollectionByName<Store['$collections'], TCollectionName, StoreCollectionNameMap>,
  Store['$collectionDefaults'],
  StoreRawCollections
>

export type StoreUpdateFormObject<
  TCollectionName extends keyof StoreCollectionNameMap,
> = UpdateFormObject<
  CollectionByName<Store['$collections'], TCollectionName, StoreCollectionNameMap>,
  Store['$collectionDefaults'],
  StoreRawCollections
>

export function useStore(): Store {
  return useNuxtApp().$rstore as any
}

declare module '@rstore/shared' {
  export interface RstoreGlobal {
    // eslint-disable-next-line ts/method-signature-style
    store(): Store
  }
}
