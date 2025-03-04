import type { constModel } from '#build/$rstore-model-const'
import type { ModelDefaults } from '@rstore/shared'
import type { VueStore } from '@rstore/vue'
import { useNuxtApp } from '#app'

export * from '@rstore/vue'

export {
  definePlugin as defineRstorePlugin,
} from '@rstore/vue'

export function useStore(): VueStore<
  typeof constModel,
  ModelDefaults
> {
  return useNuxtApp().$rstore as any
}
