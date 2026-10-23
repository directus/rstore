import type { RealtimeHookDefinitions } from '@rstore/shared'
import type { TestCollectionDefaults, TestSchema, UsersCollection } from '../../shared/test/types/collections'
import type { CachedPageRefs, CollectionDefaults, CustomCacheState, CustomHookMeta, FindOptions, HybridPromise, LiveQueryOptions, SetResultOptions, SetResultOutcome, SetSubscriptionResult, StoreSchema, VueCollectionApi, VueQueryFetchState, VueQueryPage, VueQueryRawData, VueQueryReturn, WrappedItem } from '../src'
import { describe, expectTypeOf, test } from 'vitest'
import { ref } from 'vue'

type UserQuery<TData> = VueQueryReturn<UsersCollection, TestCollectionDefaults, TestSchema, FindOptions<UsersCollection, TestCollectionDefaults, TestSchema>, TData>

type QuerySource<TItem> = Pick<UserQuery<TItem[]>, 'data' | 'fetchMore' | 'getPage' | 'loading' | 'meta' | 'pages' | 'refresh'>

describe('public query types', () => {
  test('types reactive query contracts from the package root', () => {
    type UserItem = WrappedItem<UsersCollection, TestCollectionDefaults, TestSchema>

    expectTypeOf<HybridPromise<UserQuery<UserItem[]>>>().toExtend<Promise<UserQuery<UserItem[]>>>()
    expectTypeOf<UserQuery<UserItem[]>['confirmed']['value']>().toEqualTypeOf<boolean>()
    expectTypeOf<VueQueryPage<UsersCollection, CollectionDefaults, StoreSchema, FindOptions<UsersCollection, CollectionDefaults, StoreSchema>, unknown>['confirmed']>().toEqualTypeOf<boolean>()
    expectTypeOf<QuerySource<UserItem>['data']['value']>().toEqualTypeOf<UserItem[]>()
    expectTypeOf<VueQueryPage<UsersCollection, CollectionDefaults, StoreSchema, FindOptions<UsersCollection, CollectionDefaults, StoreSchema>, unknown>['loading']>().toEqualTypeOf<boolean>()
    expectTypeOf<VueQueryRawData<unknown>>().toExtend<{ type: string }>()
    expectTypeOf<VueQueryFetchState['error']['value']>().toEqualTypeOf<Error | null>()
  })

  test('accepts live page policy separately from query options', () => {
    type Api = VueCollectionApi<UsersCollection, TestCollectionDefaults, TestSchema, WrappedItem<UsersCollection, TestCollectionDefaults, TestSchema>>
    type Options = NonNullable<Parameters<Api['liveQuery']>[1]>
    expectTypeOf<Options>().toEqualTypeOf<LiveQueryOptions>()
    expectTypeOf({ pages: 'main' as const }).toExtend<Options>()
    expectTypeOf({ pages: 'all' as const }).toExtend<Options>()
    expectTypeOf({ pages: [1, 2] }).toExtend<Options>()
    expectTypeOf({ pages: ref([1]) }).toExtend<Options>()
    expectTypeOf({ pages: () => [1] }).toExtend<Options>()
    expectTypeOf({ pages: 'loaded' as const }).not.toExtend<Options>()
    expectTypeOf({ pages: ['1'] }).not.toExtend<Options>()
    type Payload = Parameters<RealtimeHookDefinitions<StoreSchema, CollectionDefaults>['subscribe']>[0]
    expectTypeOf<Payload['pageIndex']>().toEqualTypeOf<number | undefined>()
  })

  test('accepts numeric and serialized HLC result versions', () => {
    expectTypeOf<CustomHookMeta['$resultVersion']>().toEqualTypeOf<number | string | undefined>()
    expectTypeOf({ version: 5 }).toExtend<SetResultOptions>()
    expectTypeOf({ version: '0000000003e8:0002:server' }).toExtend<SetResultOptions>()
    expectTypeOf({ version: {} }).not.toExtend<SetResultOptions>()
  })

  test('types live result publication from the package root', () => {
    type Payload = Parameters<RealtimeHookDefinitions<StoreSchema, CollectionDefaults>['subscribe']>[0]
    expectTypeOf<NonNullable<Payload['setResult']>>().toEqualTypeOf<SetSubscriptionResult>()
    expectTypeOf<ReturnType<SetSubscriptionResult>>().toEqualTypeOf<SetResultOutcome>()
    expectTypeOf<SetResultOutcome>().toEqualTypeOf<'applied' | 'stale' | 'inactive'>()
    expectTypeOf<NonNullable<CustomCacheState['pageRefs']>[string]>().toEqualTypeOf<CachedPageRefs>()
    // Private `$` fields are not accepted as published metadata.
    expectTypeOf<NonNullable<SetResultOptions['meta']>>().not.toHaveProperty('$resultVersion')
    expectTypeOf<NonNullable<SetResultOptions['meta']>>().not.toHaveProperty('$queryTracking')
    expectTypeOf<NonNullable<SetResultOptions['meta']>>().toHaveProperty('mutationStatus')
    expectTypeOf<CustomHookMeta>().not.toHaveProperty('$resultConfirmed')
  })

  test('allows subscription hooks to refresh selected live query pages', () => {
    type SubscribePayload = Parameters<RealtimeHookDefinitions<StoreSchema, CollectionDefaults>['subscribe']>[0]

    expectTypeOf<NonNullable<SubscribePayload['refresh']>>().toBeCallableWith({ pages: [0, 2] })
  })
})
