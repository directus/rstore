import type { CollectionDefaults, WrappedItem } from '@rstore/shared'
import type { PostsCollection, ProfilesCollection, TestCollectionDefaults, TestSchema, UsersCollection } from './collections'
import { describe, expectTypeOf, it } from 'vitest'

/**
 * `WrappedItem` is what every query hands back, so it must expose the item
 * fields, the computed properties (collection and defaults), the relations with
 * the right arity and the `$` helpers — the surface `4a4bc1f fix(vue): align
 * item and form value types` had to repair.
 */

type UserItemWrapped = WrappedItem<UsersCollection, TestCollectionDefaults, TestSchema>

declare const item: UserItemWrapped
/** The same item as a hook payload types it, with generic collection defaults. */
declare const looseItem: WrappedItem<UsersCollection, CollectionDefaults, TestSchema>

describe('wrapped item data', () => {
  it('exposes the collection fields with their own types', () => {
    expectTypeOf(item.id).toEqualTypeOf<string>()
    expectTypeOf(item.email).toEqualTypeOf<string | null>()
    expectTypeOf(item.address.city).toEqualTypeOf<string>()
    expectTypeOf(item.address.zip).toEqualTypeOf<string | undefined>()
  })

  it('exposes computed properties of the collection and of the defaults', () => {
    expectTypeOf(item.displayName).toEqualTypeOf<string>()
    expectTypeOf(item.globalLabel).toEqualTypeOf<string>()
  })

  it('exposes relations as wrapped items, with the arity of the relation', () => {
    expectTypeOf(item.posts).toEqualTypeOf<Array<WrappedItem<PostsCollection, TestCollectionDefaults, TestSchema>>>()
    expectTypeOf(item.profile).toEqualTypeOf<WrappedItem<ProfilesCollection, TestCollectionDefaults, TestSchema> | undefined>()
    // Related items are wrapped too, so the helpers are available all the way
    // down instead of only on the root item.
    expectTypeOf(item.posts[0]!.title).toEqualTypeOf<string>()
    expectTypeOf(item.posts[0]!.$collection).toEqualTypeOf<'posts'>()
  })
})

describe('wrapped item helpers', () => {
  it('names the collection it came from', () => {
    expectTypeOf(item.$collection).toEqualTypeOf<'users'>()
  })

  it('types the mutation helpers', () => {
    expectTypeOf(item.$getKey()).toEqualTypeOf<string | number>()
    expectTypeOf(item.$delete()).toEqualTypeOf<Promise<void>>()
    expectTypeOf(item.$isOptimistic).toEqualTypeOf<boolean>()
    expectTypeOf(item.$updateForm()).toExtend<Promise<unknown>>()
  })

  it('accepts a partial update and rejects an unknown field', () => {
    void item.$update({ name: 'Ada' })
    // @ts-expect-error `nickname` is not a field of the users item
    void item.$update({ nickname: 'Ada' })
  })
})

describe('wrapped item writes', () => {
  it('rejects a write of the wrong type or of an unknown property', () => {
    // A write of the right type still type-checks — only the proxy in
    // `packages/vue/src/item.ts` rejects it, at runtime.
    // @ts-expect-error a number is not a valid `id`
    item.id = 42
    // @ts-expect-error `nickname` is not a field of the users item
    item.nickname = 'Ada'
    // @ts-expect-error the collection name is fixed by the item type
    item.$collection = 'posts'
  })
})

describe('wrapped item with generic collection defaults', () => {
  it('widens every unknown field to any (known gap: CollectionDefaults["computed"] is a string index signature)', () => {
    // Hook payloads are typed `ResolvedCollection<TCollection, CollectionDefaults, TSchema>`,
    // so inside a plugin the item loses excess-property checking entirely.
    // Pinned so that tightening `CollectionDefaults` becomes a visible change.
    expectTypeOf(looseItem.id).toEqualTypeOf<string>()
    expectTypeOf<UserItemWrapped['displayName']>().toEqualTypeOf<string>()
    expectTypeOf(looseItem.nickname).toBeAny()
  })
})
