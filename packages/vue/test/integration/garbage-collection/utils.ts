import type { VueStack, VueStackOptions } from '#test-utils/store/vueStack'
import type { StoreSchema } from '@rstore/shared'
import { createVueStack } from '#test-utils/store/vueStack'
import { nextTick } from 'vue'

/** Minimal flat schema used by item ownership scenarios. */
export const todoSchema: StoreSchema = [{ name: 'todos' }]

/** Blog schema used by relation ownership scenarios. */
export const blogSchema: StoreSchema = [
  {
    name: 'authors',
    relations: { posts: { many: true, to: { posts: { on: { authorId: 'id' } } } } },
  },
  {
    name: 'posts',
    relations: {
      author: { to: { authors: { on: { id: 'authorId' } } } },
      editor: { to: { authors: { on: { id: 'editorId' } } } },
      comments: { many: true, to: { comments: { on: { postId: 'id' } } } },
    },
  },
  {
    name: 'comments',
    relations: { post: { to: { posts: { on: { id: 'postId' } } } } },
  },
]

/** Create a real Vue cache stack with tombstone timers disabled for item-GC tests. */
export function createGarbageCollectionStack(options: VueStackOptions): Promise<VueStack> {
  return createVueStack({ tombstoneGc: false, ...options })
}

/** Read a cached item through the public cache API. */
export function cached(stack: VueStack, collection: string, key: string | number) {
  return stack.read(collection, key)
}

/** Return primary keys rendered by a list query. */
export function queryIds(query: any): Array<string | number> {
  return query.data.value.map((item: any) => item.id)
}

/** Let Vue apply dirty filtering and the deferred item collection callback. */
export async function drainGarbageCollection(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}
