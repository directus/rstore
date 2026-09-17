import type { TestCollectionDefaults, TestSchema, UsersCollection } from '../../shared/test/types/collections'
import type { CollectionDefaults, FindOptions, HybridPromise, StoreSchema, VueQueryFetchState, VueQueryPage, VueQueryRawData, VueQueryReturn, WrappedItem } from '../src'
import { describe, expectTypeOf, test } from 'vitest'

type UserQuery<TData> = VueQueryReturn<UsersCollection, TestCollectionDefaults, TestSchema, FindOptions<UsersCollection, TestCollectionDefaults, TestSchema>, TData>

type QuerySource<TItem> = Pick<UserQuery<TItem[]>, 'data' | 'fetchMore' | 'getPage' | 'loading' | 'meta' | 'pages' | 'refresh'>

describe('public query types', () => {
  test('types reactive query contracts from the package root', () => {
    type UserItem = WrappedItem<UsersCollection, TestCollectionDefaults, TestSchema>

    expectTypeOf<HybridPromise<UserQuery<UserItem[]>>>().toExtend<Promise<UserQuery<UserItem[]>>>()
    expectTypeOf<QuerySource<UserItem>['data']['value']>().toEqualTypeOf<UserItem[]>()
    expectTypeOf<VueQueryPage<UsersCollection, CollectionDefaults, StoreSchema, FindOptions<UsersCollection, CollectionDefaults, StoreSchema>, unknown>['loading']>().toEqualTypeOf<boolean>()
    expectTypeOf<VueQueryRawData<unknown>>().toExtend<{ type: string }>()
    expectTypeOf<VueQueryFetchState['error']['value']>().toEqualTypeOf<Error | null>()
  })
})
