import type { constModel } from '#build/$rstore-model-const'
import type { ModelDefaults } from '@rstore/shared'
import type { VueStore } from '@rstore/vue'

export * from '@rstore/vue'

export {
  definePlugin as defineRstorePlugin,
} from '@rstore/vue'

export function useStore(): VueStore<
  typeof constModel,
  ModelDefaults
> {
  const store = inject('rstore', null)
  if (store === null) {
    throw new Error('No rstore provided.')
  }
  return store
}
