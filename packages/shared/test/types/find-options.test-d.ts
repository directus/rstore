import type { Collection, CollectionDefaults, FindFirstOptions, FindManyOptions, StoreSchema } from '@rstore/shared'
import type { TestSchema, UsersCollection } from './collections'
import { describe, expectTypeOf, it } from 'vitest'

/**
 * `FindOptionsInclude` is the type consumers meet first, and it has a fix
 * history: `f5e8e4c fix(shared): type multi-relation includes` made a
 * collection with **two** relations resolve each of them to its own target
 * collection instead of to the union of all of them.
 */

declare module '@rstore/shared' {
  export interface CustomIncludeOption<
    // eslint-disable-next-line unused-imports/no-unused-vars
    TCollection extends Collection,
    // eslint-disable-next-line unused-imports/no-unused-vars
    TCollectionDefaults extends CollectionDefaults,
    // eslint-disable-next-line unused-imports/no-unused-vars
    TSchema extends StoreSchema,
  > {
    customLimit?: number
  }

  export interface CustomFilterOption<
    // eslint-disable-next-line unused-imports/no-unused-vars
    TCollection extends Collection,
    // eslint-disable-next-line unused-imports/no-unused-vars
    TCollectionDefaults extends CollectionDefaults,
    // eslint-disable-next-line unused-imports/no-unused-vars
    TSchema extends StoreSchema,
  > {
    whereRaw?: string
  }
}

type UserFindManyOptions = FindManyOptions<UsersCollection, CollectionDefaults, TestSchema>

describe('include across several relations', () => {
  it('resolves each relation to its own target collection', () => {
    const options = {
      include: {
        posts: {
          customLimit: 1,
          include: {
            comments: true,
          },
        },
        profile: true,
      },
    } satisfies UserFindManyOptions

    // Before `f5e8e4c` the relation type was inferred from the whole relation
    // record, so a second relation collapsed both to a union and the nested
    // `comments` include stopped type-checking.
    expectTypeOf(options.include.posts).toExtend<{
      customLimit?: number
      include?: { comments?: boolean }
    }>()
    expectTypeOf(options.include.profile).toExtend<boolean>()
  })

  it('accepts the legacy nested include map', () => {
    const options = {
      include: {
        posts: {
          comments: true,
        },
        profile: true,
      },
    } satisfies UserFindManyOptions

    expectTypeOf(options.include.posts).toExtend<{ comments?: boolean }>()
  })

  it('rejects a relation the collection does not declare', () => {
    const options = {
      include: {
        // @ts-expect-error `orders` is not a relation of `users`
        orders: true,
      },
    } satisfies UserFindManyOptions

    expectTypeOf(options).toExtend<UserFindManyOptions>()
  })

  it('rejects a relation of the wrong target collection in a nested include', () => {
    const options = {
      include: {
        posts: {
          include: {
            // @ts-expect-error `profile` is a relation of `users`, not of `posts`
            profile: true,
          },
        },
      },
    } satisfies UserFindManyOptions

    expectTypeOf(options).toExtend<UserFindManyOptions>()
  })
})

describe('module augmentation of find options', () => {
  it('exposes the augmented include option on every relation', () => {
    const options = {
      include: {
        posts: { customLimit: 3 },
        profile: { customLimit: 1 },
      },
    } satisfies UserFindManyOptions

    expectTypeOf(options.include.profile).toExtend<{ customLimit?: number }>()
  })

  it('exposes the augmented filter option next to the predicate form', () => {
    const augmented = {
      filter: { whereRaw: 'name is not null' },
    } satisfies UserFindManyOptions

    const predicate = {
      filter: item => item.name.length > 0,
    } satisfies UserFindManyOptions

    expectTypeOf(augmented.filter).toExtend<{ whereRaw?: string }>()
    expectTypeOf(predicate.filter).toBeFunction()
  })
})

describe('find first options', () => {
  it('adds the key on top of the find options', () => {
    const options = {
      key: 'u1',
      include: { profile: true },
    } satisfies FindFirstOptions<UsersCollection, CollectionDefaults, TestSchema>

    expectTypeOf(options.key).toEqualTypeOf<string>()
    expectTypeOf<FindFirstOptions<UsersCollection, CollectionDefaults, TestSchema>['key']>()
      .toEqualTypeOf<string | number | undefined>()
  })
})
