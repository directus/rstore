import type { UpdateOptions } from '@rstore/core'
import type { Collection, CollectionDefaults, CustomHookMeta, ResolvedCollectionItem, StandardSchemaV1, StoreSchema } from '@rstore/shared'
import type { VueUpdateFormObject } from './form'
import type { WrappedItemMetadata } from './item'

declare module '@rstore/shared' {
  export interface CustomCacheState {
    markers: Record<string, boolean>
    collections: Record<string, Record<string | number, any>>
    modules: Record<string, any>
    queryMeta: Record<string, CustomHookMeta>
    /**
     * Per-field HLC stamps, by collection then key. Carried across the
     * SSR boundary so a stale realtime frame cannot overwrite a value the
     * server already had at a later stamp.
     */
    fieldTimestamps?: Record<string, Record<string | number, Record<string, string | number>>>
    /**
     * Deletions the server already knew about. Without them a hydrated client
     * resurrects an item the server had deleted.
     */
    tombstones?: Array<{
      collection: string
      key: string | number
      deletedAt: string | number
    }>
  }

  export interface MutationSpecialProps {
    $loading: boolean
    $error: Error | null
    $time: number
  }

  export interface WrappedItemUpdateFormOptions<
    TCollection extends Collection = Collection,
    TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
    TSchema extends StoreSchema = StoreSchema,
  > extends Pick<UpdateOptions<TCollection, TCollectionDefaults, TSchema>, 'optimistic'> {
    /**
     * Default values set in the form object initially and when it is reset.
     *
     * By default `updateForm` will initialize the fields with the existing item data.
     */
    defaultValues?: () => Partial<ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>>

    /**
     * Schema to validate the form object.
     *
     * @default collection.schema.update
     */
    schema?: StandardSchemaV1
  }

  export interface WrappedItemUpdateOptions<
    TCollection extends Collection = Collection,
    TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
    TSchema extends StoreSchema = StoreSchema,
  > extends Pick<UpdateOptions<TCollection, TCollectionDefaults, TSchema>, 'optimistic'> {
  }

  export interface WrappedItemUpdateFormResultAugmentation<
    TCollection extends Collection = Collection,
    TCollectionDefaults extends CollectionDefaults = CollectionDefaults,
    TSchema extends StoreSchema = StoreSchema,
  > {
    formObject: VueUpdateFormObject<TCollection, TCollectionDefaults, TSchema>
  }

  export interface WrappedItemBase<
    TCollection extends Collection,
    TCollectionDefaults extends CollectionDefaults,
    TSchema extends StoreSchema,
  > {
    $meta: WrappedItemMetadata<TCollection, TCollectionDefaults, TSchema>
    $raw: () => ResolvedCollectionItem<TCollection, TCollectionDefaults, TSchema>
  }
}

export {}
