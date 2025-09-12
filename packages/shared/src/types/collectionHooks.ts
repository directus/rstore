import type { Collection, CollectionDefaults, StoreSchema } from './collection'
import type { FindFirstOptions, FindManyOptions } from './query'
import type { Awaitable } from './utils'

export interface CollectionHooks<
  TCollection extends Collection,
> {
  fetchFirst?: (options: FindFirstOptions<TCollection, CollectionDefaults, StoreSchema>) => Awaitable<TCollection['~item'] | null>
  fetchMany?: (options: FindManyOptions<TCollection, CollectionDefaults, StoreSchema>) => Awaitable<TCollection['~item'][]>
  create?: (options: {
    item: Partial<TCollection['~item']>
  }) => Awaitable<TCollection['~item'] | void>
  update?: (options: {
    key: string | number
    item: Partial<TCollection['~item']>
  }) => Awaitable<TCollection['~item'] | void>
  delete?: (options: {
    key: string | number
  }) => Awaitable<void>
}
