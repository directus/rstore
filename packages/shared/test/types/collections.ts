import type { Collection, StoreSchema } from '@rstore/shared'

/**
 * Collection fixtures shared by the type-level suites.
 *
 * They model typed collection definitions without importing `@rstore/core`,
 * which `packages/shared` must not depend on.
 */

/** Item of the `users` collection. */
export interface UserItem {
  id: string
  name: string
  email: string | null
  address: {
    city: string
    zip?: string
  }
}

/** Item of the `posts` collection. */
export interface PostItem {
  id: string
  title: string
  userId: string
  tags: string[]
}

/** Item of the `comments` collection. */
export interface CommentItem {
  id: string
  postId: string
  body: string
}

/** Item of the `profiles` collection. */
export interface ProfileItem {
  id: string
  userId: string
  bio: string
}

/** `comments`, a leaf collection with no relation. */
export interface CommentsCollection extends Collection<CommentItem> {
  name: 'comments'
}

/** `profiles`, a leaf collection with no relation. */
export interface ProfilesCollection extends Collection<ProfileItem> {
  name: 'profiles'
}

/** `posts`, related to `comments`. */
export interface PostsCollection extends Collection<PostItem> {
  name: 'posts'
  relations: {
    comments: {
      many: true
      to: { comments: { on: { postId: 'id' } } }
    }
  }
}

/** `users`, with a computed property and two relations of different arity. */
export interface UsersCollection extends Collection<UserItem, { displayName: string }> {
  name: 'users'
  computed: {
    displayName: (item: UserItem) => string
  }
  relations: {
    posts: {
      many: true
      to: { posts: { on: { userId: 'id' } } }
    }
    profile: {
      to: { profiles: { on: { userId: 'id' } } }
    }
  }
}

/**
 * Defaults of the test store, with one computed property shared by every
 * collection.
 *
 * Declared as a type alias on purpose: an interface has no implicit index
 * signature, so it would not satisfy the `CollectionDefaults` constraint.
 */
// eslint-disable-next-line ts/consistent-type-definitions
export type TestCollectionDefaults = {
  computed: {
    globalLabel: (item: { id: string }) => string
  }
}

/** The schema every type-level suite resolves collection names against. */
export type TestSchema = StoreSchema<[
  UsersCollection,
  PostsCollection,
  CommentsCollection,
  ProfilesCollection,
]>
