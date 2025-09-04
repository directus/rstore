import type { constModels } from '#build/$rstore-model-const'
import type { ModelByName, ModelNameMap, ResolvedModelItem, WrappedItem } from '@rstore/shared'
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

export type StoreRawModels = typeof constModels

export interface StoreModelDefaults {}

export type Store = VueStore<
  StoreRawModels,
  StoreModelDefaults
>

type StoreModelNameMap = ModelNameMap<StoreRawModels>

export type StoreResolvedModelItem<
  TModelName extends keyof StoreModelNameMap,
> = ResolvedModelItem<
  ModelByName<Store['$models'], TModelName, StoreModelNameMap>,
  Store['$modelDefaults'],
  StoreRawModels
>

export type StoreWrappedItem<
  TModelName extends keyof StoreModelNameMap,
> = WrappedItem<
  ModelByName<Store['$models'], TModelName, StoreModelNameMap>,
  Store['$modelDefaults'],
  StoreRawModels
>

export type StoreCreateFormObject<
  TModelName extends keyof StoreModelNameMap,
> = CreateFormObject<
  ModelByName<Store['$models'], TModelName, StoreModelNameMap>,
  Store['$modelDefaults'],
  StoreRawModels
>

export type StoreUpdateFormObject<
  TModelName extends keyof StoreModelNameMap,
> = UpdateFormObject<
  ModelByName<Store['$models'], TModelName, StoreModelNameMap>,
  Store['$modelDefaults'],
  StoreRawModels
>

export function useStore(): Store {
  return useNuxtApp().$rstore as any
}
