import type { CollectionDefaults, GlobalStoreType, HookDefinitions, ResolvedCollection } from '@rstore/shared'
import type { TestSchema, UserItem, UsersCollection } from './collections'
import { createHooks } from '@rstore/shared'
import { describe, expectTypeOf, it } from 'vitest'

/**
 * Hook payloads are generic over the collection: a plugin that annotates its
 * callback for one collection must see that collection's item type, and a
 * `setResult` / `getResult` of another shape must not compile.
 */

declare module '@rstore/shared' {
  interface CustomHookMeta {
    testPluginTag?: string
  }
}

type Hooks = HookDefinitions<TestSchema, CollectionDefaults>

declare const store: GlobalStoreType
declare const usersCollection: ResolvedCollection<UsersCollection, CollectionDefaults, TestSchema>

describe('fetch hook payloads', () => {
  it('binds the item type from the collection in the payload', () => {
    const fetchMany: Hooks['fetchMany'] = () => {}

    fetchMany({
      store,
      meta: {},
      collection: usersCollection,
      getResult: () => [],
      setResult: (result) => {
        expectTypeOf(result).toEqualTypeOf<UserItem[]>()
      },
      setMarker: () => {},
      abort: () => {},
    })
  })

  it('rejects a result that is not the collection item', () => {
    const fetchMany: Hooks['fetchMany'] = () => {}

    fetchMany({
      store,
      meta: {},
      collection: usersCollection,
      // @ts-expect-error a fetch result must carry the collection item type
      getResult: () => [{ nope: true }],
      setResult: () => {},
      setMarker: () => {},
      abort: () => {},
    })
  })
})

describe('mutation hook payloads', () => {
  it('types the item and the result of afterMutation', () => {
    const afterMutation: Hooks['afterMutation'] = () => {}

    afterMutation({
      store,
      meta: {},
      collection: usersCollection,
      mutation: 'update',
      item: { name: 'Ada' },
      getResult: () => undefined,
      setResult: (result) => {
        expectTypeOf(result).toEqualTypeOf<UserItem>()
      },
    })
  })

  it('rejects an item field the collection does not have', () => {
    const beforeMutation: Hooks['beforeMutation'] = () => {}

    beforeMutation({
      store,
      meta: {},
      collection: usersCollection,
      mutation: 'create',
      // @ts-expect-error `nickname` is not a field of the users item
      item: { nickname: 'Ada' },
      modifyItem: () => {},
      setItem: () => {},
    })
  })
})

describe('resolveFindOptions payload', () => {
  it('discriminates the find options on the many flag', () => {
    const resolveFindOptions: Hooks['resolveFindOptions'] = () => {}

    resolveFindOptions({
      store,
      meta: {},
      collection: usersCollection,
      many: false,
      updateFindOptions: (findOptions) => {
        expectTypeOf(findOptions.key).toEqualTypeOf<string | number | undefined>()
      },
    })

    resolveFindOptions({
      store,
      meta: {},
      collection: usersCollection,
      many: true,
      updateFindOptions: (findOptions) => {
        // @ts-expect-error a findMany call carries no key
        expectTypeOf(findOptions.key).toBeNever()
      },
    })
  })
})

describe('custom hook meta augmentation', () => {
  it('is visible on the payload of a registered hook', () => {
    const hooks = createHooks<TestSchema, CollectionDefaults>()

    hooks.hook('beforeFetch', (payload) => {
      // Plugins carry state across hooks through `meta`, which they augment.
      expectTypeOf(payload.meta.testPluginTag).toEqualTypeOf<string | undefined>()
      expectTypeOf(payload.many).toEqualTypeOf<boolean>()
    })

    expectTypeOf(hooks.callHook).toBeFunction()
  })

  it('keeps the hook names of the definitions', () => {
    const hooks = createHooks<TestSchema, CollectionDefaults>()

    expectTypeOf<Parameters<typeof hooks.hook>[0]>().toExtend<keyof Hooks>()
    // @ts-expect-error `notAHook` is not part of the hook definitions
    hooks.hook('notAHook', () => {})
  })
})
