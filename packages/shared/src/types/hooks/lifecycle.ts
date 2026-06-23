import type { CollectionDefaults, StoreSchema } from '../collection'
import type { GlobalStoreType } from '../global'
import type { ResolvedModule } from '../module'
import type { Awaitable } from '../utils'
import type { CustomHookMeta } from './meta'

/**
 * Store lifecycle and module hooks.
 */
export interface LifecycleHookDefinitions<
  _TSchema extends StoreSchema,
  _TCollectionDefaults extends CollectionDefaults,
> {
  init: (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
    },
  ) => Awaitable<void>

  moduleResolved: (
    payload: {
      store: GlobalStoreType
      module: ResolvedModule<any, any>
    },
  ) => Awaitable<void>
}
