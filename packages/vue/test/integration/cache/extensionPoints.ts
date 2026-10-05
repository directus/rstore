import type { StoreSchema } from '@rstore/shared'
import { createTestStore } from '#test-utils/store/integrationStore'

declare module '@rstore/shared' {
  interface CustomCacheWriteMetadata {
    /** Test-only metadata key consumed by the extension-point suites. */
    version?: number
    /** Test-only metadata key nobody consumes. */
    source?: string
  }
}

/** Authors own posts through an indexed `authorId` foreign key. */
export const blogSchema: StoreSchema = [
  {
    name: 'authors',
    relations: { posts: { many: true, to: { posts: { on: { authorId: 'id' } } } } },
  },
  {
    name: 'posts',
    relations: { author: { to: { authors: { on: { id: 'authorId' } } } } },
  },
]

/** One `cacheBeforeWriteItem` / `cacheBeforeDeleteItem` call as a handler observed it. */
export interface ObservedBeforeHook {
  collection: string
  key: string | number
  existing: Record<string, any> | undefined
  incoming?: Record<string, any>
  metadata: Record<string, any> | undefined
}

/**
 * Creates a real store on the blog schema and records every call of both cache
 * interception hooks, copying the payload values at call time.
 */
export async function createObservedStore(options: Record<string, any> = {}) {
  const store = await createTestStore({ schema: blogSchema, plugins: [], ...options } as any) as any
  const writes: ObservedBeforeHook[] = []
  const deletes: ObservedBeforeHook[] = []
  store.$hooks.hook('cacheBeforeWriteItem', (payload: any) => {
    writes.push({
      collection: payload.collection.name,
      key: payload.key,
      existing: payload.existing && { ...payload.existing },
      incoming: { ...payload.incoming },
      metadata: payload.metadata,
    })
  })
  store.$hooks.hook('cacheBeforeDeleteItem', (payload: any) => {
    deletes.push({
      collection: payload.collection.name,
      key: payload.key,
      existing: payload.existing && { ...payload.existing },
      metadata: payload.metadata,
    })
  })
  const authors = store.$collections.find((c: any) => c.name === 'authors')
  const posts = store.$collections.find((c: any) => c.name === 'posts')
  return { store, cache: store.$cache, authors, posts, writes, deletes }
}
