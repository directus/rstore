import type { constModels } from '#build/$rstore-model-const'
import type { ModelByName, ModelDefaults, ModelNameMap, ResolvedModelItem, WrappedItem } from '@rstore/shared'
import type { VueStore } from '@rstore/vue'
import { useNuxtApp } from '#app'

export * from '@rstore/vue'

export {
  definePlugin as defineRstorePlugin,
} from '@rstore/vue'

export type StoreRawModels = typeof constModels

export type Store = VueStore<
  StoreRawModels,
  ModelDefaults
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

export function useStore(): Store {
  return useNuxtApp().$rstore as any
}
