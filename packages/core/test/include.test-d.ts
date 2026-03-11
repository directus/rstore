import type { Collection, CollectionDefaults, FindManyOptions, StoreSchema } from '@rstore/shared'
import { describe, expectTypeOf, test } from 'vitest'
import { withItemType } from '../src'

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
}

describe('typed include options', () => {
  test('supports custom include objects and legacy nested include maps', () => {
    interface User {
      id: string
    }

    interface Post {
      id: string
      userId: string
    }

    interface Comment {
      id: string
      postId: string
    }

    const _comments = withItemType<Comment>().defineCollection({
      name: 'comments',
    })

    const _posts = withItemType<Post>().defineCollection({
      name: 'posts',
      relations: {
        comments: {
          to: {
            comments: {
              on: {
                postId: 'id',
              },
            },
          },
          many: true,
        },
      },
    })

    const _users = withItemType<User>().defineCollection({
      name: 'users',
      relations: {
        posts: {
          to: {
            posts: {
              on: {
                userId: 'id',
              },
            },
          },
          many: true,
        },
      },
    })

    type Schema = [typeof _users, typeof _posts, typeof _comments]
    type UserFindManyOptions = FindManyOptions<typeof _users, CollectionDefaults, Schema>

    const customOptions = {
      include: {
        posts: {
          customLimit: 1,
          include: {
            comments: true,
          },
        },
      },
    } satisfies UserFindManyOptions

    const legacyOptions = {
      include: {
        posts: {
          comments: true,
        },
      },
    } satisfies UserFindManyOptions

    expectTypeOf(customOptions.include?.posts).toMatchTypeOf<boolean | {
      customLimit?: number
      include?: {
        comments?: boolean
      }
    } | undefined>()

    expectTypeOf(legacyOptions.include?.posts).toMatchTypeOf<boolean | {
      comments?: boolean
    } | undefined>()
  })
})
