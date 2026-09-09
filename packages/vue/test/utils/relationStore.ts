import type { StoreSchema } from '@rstore/shared'
import { createVueStack } from '#test-utils/store/vueStack'

/**
 * Schema shared by the relation form specs: a `users` collection with one
 * to-one relation (`profile`) and one to-many relation (`posts`).
 */
export const relationSchema: StoreSchema = [
  {
    name: 'users',
    relations: {
      profile: { many: false, to: { profiles: { on: { id: 'profileId' } } } },
      posts: { many: true, to: { posts: { on: { authorId: 'id' } } } },
    },
  },
  { name: 'profiles' },
  { name: 'posts' },
]

/**
 * Builds the real store the relation form specs give to `createFormObject`.
 *
 * A form only resolves relation values when it holds a real store: with a
 * stub, every branch of `packages/vue/src/form/relations.ts` that reads
 * `ctx.options.store` takes its disabled path, so `$value` answers `null` /
 * `[]` whatever the cache holds and the resolution is never executed.
 *
 * No remote: these specs never fetch, they read what they wrote to the cache.
 */
export async function createRelationStack() {
  // Not spread: the stack exposes `remote` as a getter that throws when there
  // is no fake backend, and a spread would read it.
  const stack = await createVueStack({ schema: relationSchema, remote: false })
  return {
    /** The `collection` + `store` pair every form of these specs is built with. */
    formBase: {
      collection: stack.collection('users'),
      store: stack.store,
    },
    /**
     * Writes one row straight into the cache, as a fetch would.
     *
     * @param collection Name of the collection to write into.
     * @param item The row, keyed by its `id`.
     */
    write: (collection: string, item: Record<string, any>) => stack.cache.writeItem({
      collection: stack.collection(collection),
      key: item.id,
      item,
    }),
  }
}
