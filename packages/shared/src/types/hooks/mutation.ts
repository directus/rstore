import type { Collection, CollectionDefaults, ResolvedCollection, ResolvedCollectionItemBase, StoreSchema } from '../collection'
import type { FormOperation } from '../formOperation'
import type { GlobalStoreType } from '../global'
import type { KeyedMutationItemEntry, MutationItemEntry } from '../mutation'
import type { Awaitable, Path, PathValue } from '../utils'
import type { AbortableOptions, CustomHookMeta } from './meta'

/**
 * Mutation hooks.
 */
export interface MutationHookDefinitions<
  TSchema extends StoreSchema,
  TCollectionDefaults extends CollectionDefaults,
> {
  /** Observe a failed mutation; returned promises are not awaited and observer errors are ignored. */
  mutationError: <TCollection extends Collection>(payload: {
    /** Opaque identity shared only by one Core invocation. @internal */
    operation?: object
    /** Store owning the operation. */
    store: GlobalStoreType
    /** Same metadata identity used by the mutation lifecycle. */
    meta: CustomHookMeta
    /** Collection being mutated. */
    collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
    /** Mutation operation requested by the caller. */
    mutation: 'create' | 'update' | 'delete'
    /** Whether the operation mutates multiple items. */
    many: boolean
    /** Single-item target when available. */
    key?: string | number
    /** Single-item input when available. */
    item?: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
    /** Multiple target keys when available. */
    keys?: Array<string | number>
    /** Multiple inputs, including keyed update entries when present. */
    items?: Array<Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> | { key?: string | number, item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> }>
    /** Original application error, including non-Error thrown values. */
    error: unknown
  }) => Awaitable<void>

  beforeMutation: <
    TCollection extends Collection,
  > (
    payload: {
      /** Opaque identity shared only by one Core invocation. @internal */
      operation?: object
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      item?: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      modifyItem: <TItem extends ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>, TPath extends Path<TItem>> (path: TPath, value: PathValue<TItem, TPath>) => void
      setItem: (item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>) => void
      mutation: 'create' | 'update' | 'delete'
      /** Form operations from a form submission. */
      formOperations?: FormOperation[]
    },
  ) => Awaitable<void>

  afterMutation: <
    TCollection extends Collection,
  > (
    payload: {
      /** Opaque identity shared only by one Core invocation. @internal */
      operation?: object
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key?: string | number
      item?: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      mutation: 'create' | 'update' | 'delete'
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>) => void
      /** Form operations from a form submission. */
      formOperations?: FormOperation[]
    },
  ) => Awaitable<void>

  beforeManyMutation: <
    TCollection extends Collection,
  > (
    payload: {
      /** Opaque identity shared only by one Core invocation. @internal */
      operation?: object
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      keys?: Array<string | number>
      items?: Array<Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>>
      setItems: (item: Array<Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>>) => void
      mutation: 'create' | 'update' | 'delete'
    },
  ) => Awaitable<void>

  afterManyMutation: <
    TCollection extends Collection,
  > (
    payload: {
      /** Opaque identity shared only by one Core invocation. @internal */
      operation?: object
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      keys?: Array<string | number>
      items?: Array<MutationItemEntry<Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>>>
      mutation: 'create' | 'update' | 'delete'
      getResult: () => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      setResult: (result: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>) => void
    },
  ) => Awaitable<void>

  /**
   * Called when an item is created.
   */
  createItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>, options?: AbortableOptions) => void
      /** Don't call remaining hooks in the queue. */
      abort: () => void
      /** Form operations from a form submission. */
      formOperations?: FormOperation[]
    },
  ) => Awaitable<void>

  /**
   * Called when many items are created.
   */
  createMany: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      items: Array<Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>>
      getResult: () => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      setResult: (result: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>, options?: AbortableOptions) => void
      /** Don't call remaining hooks in the queue. */
      abort: () => void
    },
  ) => Awaitable<void>

  /**
   * Called when an item is updated.
   */
  updateItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key: string | number
      item: Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>
      getResult: () => ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema> | undefined
      setResult: (result: ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>, options?: AbortableOptions) => void
      /** Don't call remaining hooks in the queue. */
      abort: () => void
      /** Form operations from a form submission. */
      formOperations?: FormOperation[]
    },
  ) => Awaitable<void>

  /**
   * Called when many items are updated.
   */
  updateMany: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      items: Array<KeyedMutationItemEntry<Partial<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>>>
      getResult: () => Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>> | undefined
      setResult: (result: Array<ResolvedCollectionItemBase<TCollection, TCollectionDefaults, TSchema>>, options?: AbortableOptions) => void
      /** Don't call remaining hooks in the queue. */
      abort: () => void
    },
  ) => Awaitable<void>

  /**
   * Called when an item is deleted.
   */
  deleteItem: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      key: string | number
      /** Don't call remaining hooks in the queue. */
      abort: () => void
    },
  ) => Awaitable<void>

  /**
   * Called when many items are deleted.
   */
  deleteMany: <
    TCollection extends Collection,
  > (
    payload: {
      store: GlobalStoreType
      meta: CustomHookMeta
      collection: ResolvedCollection<TCollection, TCollectionDefaults, TSchema>
      keys: Array<string | number>
      /** Don't call remaining hooks in the queue. */
      abort: () => void
    },
  ) => Awaitable<void>
}
