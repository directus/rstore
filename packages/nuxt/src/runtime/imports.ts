import type { constModels } from '#build/$rstore-model-const'
import type { ModelByName, ModelNameMap, ResolvedModelItem, WrappedItem } from '@rstore/shared'
import type { CreateFormObject, UpdateFormObject, VueStore } from '@rstore/vue'
import { useNuxtApp } from '#app'

export * from '@rstore/vue'

export {
  createModule as createRstoreModule,
  defineModule as defineRstoreModule,
  definePlugin as defineRstorePlugin,
} from '@rstore/vue'

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
