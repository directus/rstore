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
  /** Synchronous lifetime notification emitted once by an owning cache on disposal. */
  dispose: (payload: {
    /** Store whose cache resources are being released. */
    store: GlobalStoreType
  }) => void

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
