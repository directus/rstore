import type { UpdateOptions } from '@rstore/core'
import type { Collection, CollectionDefaults, CustomHookMeta, ResolvedCollectionItem, StandardSchemaV1, StoreSchema } from '@rstore/shared'
import type { WrappedItemMetadata } from './item'

declare module '@rstore/shared' {
  export interface CustomCacheState {
    markers: Record<string, boolean>
    collections: Record<string, Record<string | number, any>>
    modules: Record<string, any>
    queryMeta: Record<string, CustomHookMeta>
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
