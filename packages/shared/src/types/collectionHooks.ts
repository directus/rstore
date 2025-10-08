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
  }) => Awaitable<TCollection['~item']>
  createMany?: (options: {
    items: Array<Partial<TCollection['~item']>>
  }) => Awaitable<Array<TCollection['~item']>>
  update?: (options: {
    key: string | number
    item: Partial<TCollection['~item']>
  }) => Awaitable<TCollection['~item']>
  updateMany?: (options: {
    items: Array<Partial<TCollection['~item']>>
  }) => Awaitable<Array<TCollection['~item']>>
  delete?: (options: {
    key: string | number
  }) => Awaitable<void>
  deleteMany?: (options: {
    keys: Array<string | number>
  }) => Awaitable<void>
}
