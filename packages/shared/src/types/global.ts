import type { CollectionDefaults, StoreSchema } from './collection'
import type { StoreCore } from './store'

/**
 * This interface is designed to be augmented by user code
 * to provide a custom Store type then used in various places
 * such as plugin hooks
 */
export interface RstoreGlobal {
  // eslint-disable-next-line ts/method-signature-style
  store(): StoreCore<StoreSchema, CollectionDefaults>
}

export type GlobalStoreType = ReturnType<RstoreGlobal['store']>
