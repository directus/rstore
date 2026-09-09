import { createVueStack } from '#test-utils/store/vueStack'
import { defineCollection, defineRelations, withItemType } from '@rstore/core'
import { describe, expect, it } from 'vitest'

/** Public builder definitions, including a relation declared separately from its collection. */
function schema() {
  const users = withItemType<{ id: string, name: string }>().defineCollection({ name: 'users' })
  const posts = defineCollection({ name: 'posts' })
  const relations = defineRelations(users, ({ collection }) => ({
    posts: { many: true, to: collection(posts, { on: { authorId: 'id' } }) },
  }))
  return { users, posts, relations }
}

describe('public schema builders', () => {
  it('loads separately declared relations and keeps their items coherent after mutation', async () => {
    const { users, posts, relations } = schema()
    const stack = await createVueStack({
      schema: [users, posts, relations],
      data: { users: [{ id: 'u1', name: 'Ada' }], posts: [{ id: 'p1', authorId: 'u1', title: 'First' }] },
    })
    const user = await stack.store.users.findFirst({ key: 'u1', include: { posts: true } })
    expect(user.name).toBe('Ada')
    expect(user.posts.map((post: { title: string }) => post.title)).toEqual(['First'])
    await stack.store.posts.update({ id: 'p1', title: 'Updated' })
    expect(user.posts[0].title).toBe('Updated')
    expect(stack.remote.rows('posts')[0]!.title).toBe('Updated')
  })

  it('rejects a separately declared relation whose owner is absent from the schema', async () => {
    const { posts, relations } = schema()
    await expect(createVueStack({ schema: [posts, relations], remote: false, tombstoneGc: false }))
      .rejects
      .toThrow('Collection "users" not found in store')
  })
})
